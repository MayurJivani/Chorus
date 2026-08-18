/**
 * Turns a category into a playable track pool, cached exactly like an artist's catalog.
 *
 * Reuses `artist_track_pools` rather than adding a parallel table: the row is keyed by an
 * opaque text id, and a category slug ("year-2024") can never collide with a numeric Deezer
 * artist id. That also means categories inherit the eviction sweep and the stale-while-
 * revalidate refresh for free.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { artistTrackPools } from '../db/schema';
import { fetchPlaylistTracks } from './dailyPlaylistService';
import { type ArtistTrack } from './deezerService';
import {
  isUnwantedVersion,
  normalizeTitle,
  stripAnyTrailingQualifier,
} from '../utils/trackFilters';
import { findCategory } from './categories';
import { logger } from '../logger';

/** A category pool is a fixed editorial playlist, so it changes far more slowly than an
 *  artist's discography — except the live chart, which is why this is only a day. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** Ten rounds need at least ten tracks; below this the category is unplayable. */
const MIN_CATEGORY_TRACKS = 10;

/**
 * Deduplicates a playlist down to one entry per song.
 *
 * The feature filter is deliberately *not* applied here, unlike an artist catalog. There it
 * exists to drop tracks where the searched artist is only a guest; in a category every track
 * is by a different artist, so filtering on "feat." would throw away a large share of modern
 * pop for no reason.
 */
function buildCategoryPool(
  tracks: {
    deezerTrackId: string;
    title: string;
    artist: string;
    albumArtUrl: string | null;
    durationSeconds: number;
  }[],
): ArtistTrack[] {
  const eligible = tracks.filter((t) => !isUnwantedVersion(t.title));

  const bestByKey = new Map<string, ArtistTrack>();
  for (const t of eligible) {
    // Keyed on artist *and* title: two different artists can legitimately have songs of the
    // same name, and a category spans many artists.
    const key = `${normalizeTitle(t.artist)}|${normalizeTitle(stripAnyTrailingQualifier(t.title))}`;
    if (!bestByKey.has(key)) bestByKey.set(key, t);
  }

  // Sorted so `seededShuffle` gets a reproducible input, same as the artist catalog.
  return [...bestByKey.values()].sort((a, b) => a.deezerTrackId.localeCompare(b.deezerTrackId));
}

async function readPool(categoryId: string) {
  const rows = await db
    .select()
    .from(artistTrackPools)
    .where(
      and(
        eq(artistTrackPools.deezerArtistId, categoryId),
        eq(artistTrackPools.includeFeatures, false),
      ),
    )
    .limit(1);
  return rows[0];
}

async function writePool(categoryId: string, label: string, tracks: ArtistTrack[]): Promise<void> {
  const now = new Date();
  await db
    .insert(artistTrackPools)
    .values({
      deezerArtistId: categoryId,
      includeFeatures: false,
      artistName: label,
      tracks,
      trackCount: tracks.length,
      fetchedAt: now,
      lastAccessedAt: now,
    })
    .onConflictDoUpdate({
      target: [artistTrackPools.deezerArtistId, artistTrackPools.includeFeatures],
      set: {
        artistName: label,
        tracks,
        trackCount: tracks.length,
        fetchedAt: now,
        lastAccessedAt: now,
      },
    });
}

/**
 * The category's playable tracks. Served from the stored pool when one exists, refreshing in
 * the background once it is a day old, otherwise fetched from the backing playlist.
 */
export async function getCategoryCatalog(categoryId: string): Promise<ArtistTrack[]> {
  const category = findCategory(categoryId);
  if (!category) throw new Error(`Unknown category: ${categoryId}`);

  let stored;
  try {
    stored = await readPool(categoryId);
  } catch (err) {
    logger.warn({ err, categoryId }, 'Category pool lookup failed; fetching live');
  }

  if (stored && stored.trackCount >= MIN_CATEGORY_TRACKS) {
    if (Date.now() - stored.fetchedAt.getTime() > REFRESH_AFTER_MS) {
      void refreshInBackground(category.id, category.label, category.playlistId);
    }
    return stored.tracks;
  }

  const tracks = buildCategoryPool(await fetchPlaylistTracks(category.playlistId));
  if (tracks.length < MIN_CATEGORY_TRACKS) {
    throw new Error(`Not enough playable tracks in ${category.label}`);
  }

  try {
    await writePool(category.id, category.label, tracks);
  } catch (err) {
    logger.warn({ err, categoryId }, 'Failed to store category pool');
  }
  return tracks;
}

const refreshing = new Set<string>();

function refreshInBackground(categoryId: string, label: string, playlistId: string): void {
  if (refreshing.has(categoryId)) return;
  refreshing.add(categoryId);

  void fetchPlaylistTracks(playlistId)
    .then(async (raw) => {
      const tracks = buildCategoryPool(raw);
      if (tracks.length < MIN_CATEGORY_TRACKS) return;
      await writePool(categoryId, label, tracks);
      logger.info({ categoryId, trackCount: tracks.length }, 'Refreshed category pool');
    })
    .catch((err) => logger.warn({ err, categoryId }, 'Category pool refresh failed'))
    .finally(() => refreshing.delete(categoryId));
}
