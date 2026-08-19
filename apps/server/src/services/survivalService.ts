/**
 * Survival mode: endless rounds, one wrong answer ends the run.
 *
 * Deliberately has no picker in front of it. Artist and Category mode both ask the player to
 * decide something before they can play; Survival is the "just start" mode, so it draws from a
 * mixed pool spanning the current chart and a spread of years rather than making anyone choose.
 *
 * Tracks are drawn one at a time instead of dealt up front. A run has no known length, and
 * dealing a hundred tracks against the chance a player survives them would waste the work almost
 * every time — the median run is short.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { survivalRuns } from '../db/schema';
import type { SurvivalRun } from '../db/schema';
import { getCategoryCatalog } from './categoryCatalogService';
import { getFreshPreviewUrl, type ArtistTrack } from './deezerService';
import { buildRoundOptions, type RoundOption } from './artistChallengeService';
import type { Identity } from '../auth/identity';
import { logger } from '../logger';

/**
 * The categories the mixed pool is built from.
 *
 * Spread across eras on purpose: a pool of only current hits would make the mode a test of
 * whether you listen to the radio this month. These are existing catalog entries, so they are
 * already cached and already refreshed on their own schedule.
 */
const POOL_CATEGORY_IDS = [
  'now-worldwide',
  'year-2025',
  'year-2020',
  'year-2015',
  'year-2010',
  'year-2005',
  'year-2000',
] as const;

/** Below this the mode is not playable and the route should say so rather than serve a stub. */
const MIN_POOL_TRACKS = 30;

/** How many candidates to try before giving up on finding one with playable audio. */
const PREVIEW_ATTEMPTS = 5;

let cachedPool: { tracks: ArtistTrack[]; expiresAt: number } | null = null;
const POOL_CACHE_MS = 10 * 60 * 1000;

/**
 * The combined, deduplicated pool.
 *
 * Held in memory for a few minutes on top of the per-category Postgres cache: every round of
 * every run reads this, and merging seven catalogs on each read would be pure repeated work.
 */
export async function getSurvivalPool(): Promise<ArtistTrack[]> {
  if (cachedPool && cachedPool.expiresAt > Date.now()) return cachedPool.tracks;

  const catalogs = await Promise.all(
    POOL_CATEGORY_IDS.map((id) =>
      getCategoryCatalog(id).catch((err) => {
        // One unavailable category must not take the whole mode down.
        logger.warn({ err, categoryId: id }, 'Survival pool: category unavailable, skipping');
        return [] as ArtistTrack[];
      }),
    ),
  );

  // Deduplicated by track id: the year lists and the live chart overlap around recent hits.
  const byId = new Map<string, ArtistTrack>();
  for (const catalog of catalogs) {
    for (const track of catalog) byId.set(track.deezerTrackId, track);
  }

  const tracks = [...byId.values()];
  if (tracks.length >= MIN_POOL_TRACKS) {
    cachedPool = { tracks, expiresAt: Date.now() + POOL_CACHE_MS };
  }
  return tracks;
}

/** Test seam — drops the in-memory pool so a test's stubbed catalog is actually read. */
export function clearSurvivalPoolCache(): void {
  cachedPool = null;
}

function ownerWhere(identity: Identity) {
  return identity.userId
    ? eq(survivalRuns.userId, identity.userId)
    : eq(survivalRuns.guestId, identity.guestId ?? '');
}

async function findActiveRun(identity: Identity): Promise<SurvivalRun | undefined> {
  const rows = await db
    .select()
    .from(survivalRuns)
    .where(and(ownerWhere(identity), isNull(survivalRuns.endedAt)))
    .orderBy(desc(survivalRuns.id))
    .limit(1);
  return rows[0];
}

export interface SurvivalRound {
  runId: number;
  streak: number;
  previewUrl: string;
  /** Present only in choice mode. */
  options?: RoundOption[];
}

/** Picks a track the run hasn't served yet and whose audio actually plays. */
async function drawTrack(
  pool: ArtistTrack[],
  usedTrackIds: readonly string[],
): Promise<{ track: ArtistTrack; previewUrl: string } | null> {
  const used = new Set(usedTrackIds);
  const remaining = pool.filter((t) => !used.has(t.deezerTrackId));
  if (remaining.length === 0) return null;

  // Random rather than seeded: unlike a shared challenge, no two survival runs need to agree.
  for (let attempt = 0; attempt < PREVIEW_ATTEMPTS && remaining.length > 0; attempt += 1) {
    const index = Math.floor(Math.random() * remaining.length);
    const candidate = remaining.splice(index, 1)[0];
    if (!candidate) break;

    const fresh = await getFreshPreviewUrl(candidate.deezerTrackId);
    if (fresh) return { track: candidate, previewUrl: fresh.previewUrl };
  }

  return null;
}

export class SurvivalUnavailableError extends Error {}

/**
 * The round in play: resumes an unfinished run, or starts one.
 *
 * Resuming rather than always starting fresh is what stops a reload from being a free retry —
 * the pending track is stored on the run, so coming back mid-round returns the same song.
 */
export async function getOrStartRound(
  identity: Identity,
  guessMode: 'search' | 'choice',
): Promise<SurvivalRound> {
  const pool = await getSurvivalPool();
  if (pool.length < MIN_POOL_TRACKS) {
    throw new SurvivalUnavailableError('Survival mode is warming up — please try again shortly');
  }

  let run = await findActiveRun(identity);

  if (!run) {
    const inserted = await db
      .insert(survivalRuns)
      .values({
        userId: identity.userId,
        guestId: identity.userId ? null : identity.guestId,
        guessMode,
        usedTrackIds: [],
      })
      .returning();
    run = inserted[0];
    if (!run) throw new Error('Failed to start a survival run');
  }

  // A pending track means the player is mid-round — serve it again rather than drawing a new
  // one, so reloading cannot skip a song the player was stuck on.
  if (run.currentTrackId) {
    const fresh = await getFreshPreviewUrl(run.currentTrackId);
    if (fresh) {
      return {
        runId: run.id,
        streak: run.streak,
        previewUrl: fresh.previewUrl,
        ...(guessMode === 'choice'
          ? {
              options: buildRoundOptions(
                {
                  deezerTrackId: run.currentTrackId,
                  title: run.currentTitle ?? '',
                  artist: run.currentArtist ?? '',
                },
                pool,
              ),
            }
          : {}),
      };
    }
    // The stored track has gone unplayable; fall through and draw a replacement.
  }

  const drawn = await drawTrack(pool, run.usedTrackIds);
  if (!drawn) {
    throw new SurvivalUnavailableError('No playable songs are available right now');
  }

  await db
    .update(survivalRuns)
    .set({
      currentTrackId: drawn.track.deezerTrackId,
      currentTitle: drawn.track.title,
      currentArtist: drawn.track.artist,
      currentAlbumArtUrl: drawn.track.albumArtUrl,
      usedTrackIds: [...run.usedTrackIds, drawn.track.deezerTrackId],
      updatedAt: new Date(),
    })
    .where(eq(survivalRuns.id, run.id));

  return {
    runId: run.id,
    streak: run.streak,
    previewUrl: drawn.previewUrl,
    ...(guessMode === 'choice' ? { options: buildRoundOptions(drawn.track, pool) } : {}),
  };
}

export interface SurvivalGuessResult {
  correct: boolean;
  /** The streak after this answer — one higher on a hit, final on a miss. */
  streak: number;
  runOver: boolean;
  song: { title: string; artist: string; albumArtUrl: string | null };
  /** Set when the run ends: the player's best streak before this one, for context. */
  personalBest?: number;
}

/**
 * Answers the pending round. A miss — wrong song or a skip — ends the run.
 *
 * `deezerTrackId` omitted means the player gave up on this song, which is a miss: there is no
 * partial credit in a mode whose whole rule is that you keep going until you don't.
 */
export async function submitSurvivalGuess(
  identity: Identity,
  deezerTrackId: string | undefined,
): Promise<SurvivalGuessResult> {
  const run = await findActiveRun(identity);
  if (!run || !run.currentTrackId) {
    throw new SurvivalUnavailableError('No survival round is in progress');
  }

  const song = {
    title: run.currentTitle ?? '',
    artist: run.currentArtist ?? '',
    albumArtUrl: run.currentAlbumArtUrl,
  };

  const correct = deezerTrackId !== undefined && deezerTrackId === run.currentTrackId;

  if (correct) {
    const streak = run.streak + 1;
    await db
      .update(survivalRuns)
      .set({
        streak,
        // Cleared so the next request draws a new song rather than re-serving this one.
        currentTrackId: null,
        currentTitle: null,
        currentArtist: null,
        currentAlbumArtUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(survivalRuns.id, run.id));

    return { correct: true, streak, runOver: false, song };
  }

  const personalBest = await getBestStreak(identity);

  await db
    .update(survivalRuns)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(eq(survivalRuns.id, run.id));

  return { correct: false, streak: run.streak, runOver: true, song, personalBest };
}

/** The player's longest finished streak, ignoring the run currently in progress. */
export async function getBestStreak(identity: Identity): Promise<number> {
  const rows = await db
    .select({ best: sql<number>`COALESCE(MAX(${survivalRuns.streak}), 0)::int` })
    .from(survivalRuns)
    .where(ownerWhere(identity));
  return rows[0]?.best ?? 0;
}

/** Abandons the run in progress, so the next visit starts clean. */
export async function endActiveRun(identity: Identity): Promise<void> {
  await db
    .update(survivalRuns)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(and(ownerWhere(identity), isNull(survivalRuns.endedAt)));
}

export interface SurvivalStanding {
  rank: number;
  displayName: string;
  bestStreak: number;
  runs: number;
  isYou: boolean;
}

/**
 * Longest streak per player.
 *
 * Best-of is the right metric here, unlike the artist boards: a survival run cannot be farmed,
 * because a bad draw ends it rather than being discarded. Replaying is how the mode is played.
 */
export async function getSurvivalLeaderboard(
  identity: Identity,
  limit = 20,
): Promise<{ entries: SurvivalStanding[]; myBest: number; myRuns: number }> {
  const rows = (await db.execute(sql`
    SELECT
      u.id                        AS "userId",
      u.display_name              AS "displayName",
      MAX(r.streak)::int          AS "bestStreak",
      COUNT(*)::int               AS "runs"
    FROM survival_runs r
    JOIN users u ON u.id = r.user_id
    WHERE r.ended_at IS NOT NULL AND r.user_id IS NOT NULL
    GROUP BY u.id, u.display_name
    ORDER BY "bestStreak" DESC, "runs" ASC
    LIMIT ${limit}
  `)) as unknown as {
    userId: string;
    displayName: string | null;
    bestStreak: number;
    runs: number;
  }[];

  const mineRows = await db
    .select({
      best: sql<number>`COALESCE(MAX(${survivalRuns.streak}), 0)::int`,
      runs: sql<number>`COUNT(*)::int`,
    })
    .from(survivalRuns)
    .where(ownerWhere(identity));

  return {
    entries: rows.map((row, index) => ({
      rank: index + 1,
      displayName: row.displayName ?? 'Player',
      bestStreak: row.bestStreak,
      runs: row.runs,
      isYou: identity.userId != null && row.userId === identity.userId,
    })),
    myBest: mineRows[0]?.best ?? 0,
    myRuns: mineRows[0]?.runs ?? 0,
  };
}
