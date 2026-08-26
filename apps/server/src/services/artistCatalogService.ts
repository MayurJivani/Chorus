/**
 * Artist Mode's catalog lookup, layered so a player almost never waits on Deezer.
 *
 *   in-memory cache (1h, inside deezerService)
 *     └─ shared in-flight promise (concurrent players share one crawl)
 *          └─ `artist_track_pools` row in Postgres  ← this module
 *               └─ full Deezer crawl (one request per album; ~7s for a large discography)
 *
 * The database layer is what makes restarts cheap: the in-memory cache dies with the process,
 * so before this every deploy meant the next player to open an artist paid the full crawl
 * again. A stored pool is served immediately even when it is past its refresh window, with the
 * refresh happening in the background (stale-while-revalidate) — a slightly dated catalog is a
 * far better trade than a multi-second stall on a game screen.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { artistTrackPools } from '../db/schema';
import { getArtistTopTracks, fetchFullDiscography, type ArtistTrack } from './deezerService';
import { getSettings } from './settingsService';
import { logger } from '../logger';

/** How long a stored pool is considered current. Past this it is still served, but renewed
 *  in the background — discographies change on the order of months, not minutes. */
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Pools untouched for this long are dropped, so the table tracks the artists people actually
 *  play rather than every artist ever searched. */
export const POOL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const refreshInFlight = new Set<string>();

function poolKey(deezerArtistId: string, includeFeatures: boolean): string {
  return `${deezerArtistId}:${includeFeatures}`;
}

async function readPool(deezerArtistId: string, includeFeatures: boolean) {
  const rows = await db
    .select()
    .from(artistTrackPools)
    .where(
      and(
        eq(artistTrackPools.deezerArtistId, deezerArtistId),
        eq(artistTrackPools.includeFeatures, includeFeatures),
      ),
    )
    .limit(1);
  return rows[0];
}

async function writePool(
  deezerArtistId: string,
  includeFeatures: boolean,
  artistName: string,
  tracks: ArtistTrack[],
): Promise<void> {
  const now = new Date();
  await db
    .insert(artistTrackPools)
    .values({
      deezerArtistId,
      includeFeatures,
      artistName,
      tracks,
      trackCount: tracks.length,
      fetchedAt: now,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: [artistTrackPools.deezerArtistId, artistTrackPools.includeFeatures],
      set: {
        artistName,
        tracks,
        trackCount: tracks.length,
        fetchedAt: now,
        lastAccessedAt: now,
      },
    });
}

/** `lastAccessedAt` only decides eviction at 30-day granularity, so there is no value in
 *  rewriting it on every request — an hour of resolution is plenty. */
const TOUCH_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Bumps retention for a pool that was just served.
 *
 * Deliberately fire-and-forget — it is bookkeeping for the eviction sweep, and no request
 * should wait on (or fail because of) it. Throttled because a round of Artist Mode reads the
 * catalog several times: touching on every read turned each guess into an extra write for a
 * timestamp nobody reads until the daily sweep.
 */
function touchPool(deezerArtistId: string, includeFeatures: boolean, lastAccessedAt: Date): void {
  if (Date.now() - lastAccessedAt.getTime() < TOUCH_THROTTLE_MS) return;

  void db
    .update(artistTrackPools)
    .set({ lastAccessedAt: new Date() })
    .where(
      and(
        eq(artistTrackPools.deezerArtistId, deezerArtistId),
        eq(artistTrackPools.includeFeatures, includeFeatures),
      ),
    )
    .catch((err) => logger.warn({ err, deezerArtistId }, 'Failed to touch artist pool'));
}

function enrichOrRefreshInBackground(
  artistId: number,
  deezerArtistId: string,
  includeFeatures: boolean,
): void {
  const key = poolKey(deezerArtistId, includeFeatures);
  if (refreshInFlight.has(key)) return;
  refreshInFlight.add(key);

  void fetchFullDiscography(artistId, includeFeatures)
    .then(async (tracks) => {
      if (tracks.length === 0) return;
      await writePool(deezerArtistId, includeFeatures, tracks[0]?.artist ?? '', tracks);
      logger.info(
        { deezerArtistId, trackCount: tracks.length },
        'Enriched artist pool with full discography',
      );
    })
    .catch((err) =>
      logger.warn({ err, deezerArtistId }, 'Background artist pool enrichment failed'),
    )
    .finally(() => refreshInFlight.delete(key));
}

/**
 * The artist's playable catalog. Returns a stored pool when one exists (refreshing it in the
 * background once stale), otherwise crawls Deezer and stores the result.
 */
export async function getArtistCatalog(
  artistId: number,
  includeFeatures = false,
): Promise<ArtistTrack[]> {
  const deezerArtistId = String(artistId);

  let stored;
  try {
    stored = await readPool(deezerArtistId, includeFeatures);
  } catch (err) {
    // A cache miss must never be fatal — fall through to the live crawl.
    logger.warn({ err, deezerArtistId }, 'Artist pool lookup failed; falling back to Deezer');
  }

  if (stored && stored.trackCount > 0) {
    touchPool(deezerArtistId, includeFeatures, stored.lastAccessedAt);
    if (Date.now() - stored.fetchedAt.getTime() > REFRESH_AFTER_MS) {
      enrichOrRefreshInBackground(artistId, deezerArtistId, includeFeatures);
    }
    return stored.tracks;
  }

  const tracks = await getArtistTopTracks(artistId, includeFeatures);
  if (tracks.length > 0) {
    try {
      await writePool(deezerArtistId, includeFeatures, tracks[0]?.artist ?? '', tracks);
    } catch (err) {
      logger.warn({ err, deezerArtistId }, 'Failed to store artist pool');
    }
    enrichOrRefreshInBackground(artistId, deezerArtistId, includeFeatures);
  }
  return tracks;
}

/** Drops pools nobody has opened within the retention window. Returns the number removed. */
export async function evictStaleArtistPools(retentionMs?: number): Promise<number> {
  const effective =
    retentionMs ?? (await getSettings()).artistPoolRetentionDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - effective);
  const removed = await db
    .delete(artistTrackPools)
    .where(lt(artistTrackPools.lastAccessedAt, cutoff))
    .returning({ id: artistTrackPools.id });

  if (removed.length > 0) {
    logger.info({ removed: removed.length, cutoff }, 'Evicted stale artist pools');
  }
  return removed.length;
}

const EVICTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Runs the eviction sweep at startup and daily thereafter. Unref'd so it never holds the
 *  process open during shutdown. */
export function startArtistPoolEviction(): NodeJS.Timeout {
  void evictStaleArtistPools().catch((err) => logger.error({ err }, 'Artist pool eviction failed'));

  const timer = setInterval(() => {
    void evictStaleArtistPools().catch((err) =>
      logger.error({ err }, 'Artist pool eviction failed'),
    );
  }, EVICTION_INTERVAL_MS);

  timer.unref();
  return timer;
}

/** Test helper — drops every stored pool. */
export async function clearArtistPools(): Promise<void> {
  await db.delete(artistTrackPools);
  refreshInFlight.clear();
}

/** Exposed for observability/debugging: how many pools are stored and how big they are. */
export async function getArtistPoolStats(): Promise<{ pools: number; tracks: number }> {
  const rows = await db
    .select({
      pools: sql<number>`count(*)::int`,
      tracks: sql<number>`coalesce(sum(${artistTrackPools.trackCount}), 0)::int`,
    })
    .from(artistTrackPools);
  return rows[0] ?? { pools: 0, tracks: 0 };
}
