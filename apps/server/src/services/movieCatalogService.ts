/**
 * Turns a set of curated soundtrack albums into a playable pool where the *film* is the answer.
 *
 * The trick that lets this mode reuse every other mode's machinery is the shape of the rows it
 * produces: `title` holds the film, so the existing round builder, option builder, guess check,
 * scoring, multiplayer rooms and duels all work untouched. `artist` carries the song and its
 * performer, which is what the reveal shows once the round is over.
 *
 * That field placement is load-bearing in one direction: options must never display `artist`,
 * because it names the song currently playing. A player who recognises the track by ear would
 * otherwise read the answer straight off the option list instead of knowing the film, which is
 * the entire thing being tested. `buildRoundOptions` is called with `hideArtist` for these
 * sources; see `ChallengeSource.answerIsMovie`.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { artistTrackPools } from '../db/schema';
import { seedPreviewCacheFromPlaylist, type ArtistTrack } from './deezerService';
import { isUnwantedVersion, normalizeTitle } from '../utils/trackFilters';
import type { MovieAlbum } from './movies';
import { getSettings } from './settingsService';
import { logger } from '../logger';

/** Four options need four distinct films, and a pool that thin makes for repetitive rounds. */
const MIN_MOVIE_TRACKS = 12;

/**
 * Titles that are on a soundtrack without being a song anyone could name the film from.
 *
 * `isUnwantedVersion` already drops karaoke, instrumentals and commentary, but soundtrack albums
 * carry two extra kinds of filler it has no reason to know about: score cues named after scenes
 * ("Elephant Graveyard", "Scar Takes the Throne") and recorded dialogue. Cues are not detectable
 * from the title alone, which is why albums are hand-picked to be song-led in the first place;
 * these terms catch the labelled remainder.
 *
 * Deliberately narrow. "Theme" is not here — "Theme from Shaft" and "Love Theme From Flashdance"
 * are real, recognisable songs, and excluding the word would cost more than it saves.
 */
const NON_SONG_TERMS = [
  'dialogue',
  'dialogues',
  'outtake',
  'overture',
  'prologue',
  'epilogue',
  'end credits',
  'opening titles',
  'main titles',
  'title music',
  'score',
  'sing a long',
  'singalong',
  'sing along',
];

function isNonSong(title: string): boolean {
  const normalized = normalizeTitle(title);
  return NON_SONG_TERMS.some((term) =>
    new RegExp(`\\b${normalizeTitle(term)}\\b`).test(normalized),
  );
}

interface DeezerAlbumTrack {
  id: number;
  title: string;
  preview?: string | null;
  duration?: number;
  artist?: { name?: string };
}

interface DeezerAlbumResponse {
  title?: string;
  cover_medium?: string | null;
  error?: unknown;
  tracks?: { data?: DeezerAlbumTrack[] };
}

/**
 * One request per film. `/album/{id}` returns the cover and the full track list together, so a
 * fifty-film collection costs fifty calls on a cold pool and nothing afterwards — the result is
 * stored and refreshed on the same schedule as a category.
 */
interface FetchedAlbum {
  tracks: ArtistTrack[];
  /** Preview URLs come back with the album, so the per-track lookup can be skipped entirely. */
  seeds: { deezerTrackId: string; previewUrl: string; durationSeconds: number; artist: string }[];
}

async function fetchMovieAlbum(album: MovieAlbum): Promise<FetchedAlbum> {
  const res = await fetch(`https://api.deezer.com/album/${album.albumId}`, {
    headers: { Referer: 'https://chorusify.com/' },
  });
  if (!res.ok) {
    throw new Error(`Deezer album ${album.albumId} fetch failed with status ${res.status}`);
  }
  const body = (await res.json()) as DeezerAlbumResponse;
  if (body.error) {
    throw new Error(`Deezer album ${album.albumId} (${album.movie}) returned an error`);
  }

  const cover = body.cover_medium ?? null;
  const out: FetchedAlbum = { tracks: [], seeds: [] };
  for (const track of body.tracks?.data ?? []) {
    if (!track.id || !track.title || !track.preview) continue;
    if (isUnwantedVersion(track.title) || isNonSong(track.title)) continue;
    const deezerTrackId = String(track.id);
    const songLabel = track.artist?.name ? `${track.title} · ${track.artist.name}` : track.title;
    const durationSeconds = track.duration ?? 0;
    out.tracks.push({
      deezerTrackId,
      // The film is the answer, so it goes in the field every existing round path treats as one.
      title: album.movie,
      artist: songLabel,
      albumArtUrl: cover,
      durationSeconds,
    });
    out.seeds.push({
      deezerTrackId,
      previewUrl: track.preview,
      durationSeconds,
      artist: songLabel,
    });
  }
  return out;
}

/**
 * Deduped down to one row per song. Keyed on film *and* song title because the pool's `title`
 * is the film — keying on title alone would collapse every album to a single track.
 */
function buildMoviePool(rows: ArtistTrack[]): ArtistTrack[] {
  const bestByKey = new Map<string, ArtistTrack>();
  for (const row of rows) {
    const key = `${normalizeTitle(row.title)}|${normalizeTitle(row.artist)}`;
    if (!bestByKey.has(key)) bestByKey.set(key, row);
  }
  // Sorted so `seededShuffle` downstream gets a reproducible input, same as the other pools.
  return [...bestByKey.values()].sort((a, b) => a.deezerTrackId.localeCompare(b.deezerTrackId));
}

async function fetchAllAlbums(albums: MovieAlbum[]): Promise<ArtistTrack[]> {
  const results = await Promise.allSettled(albums.map((album) => fetchMovieAlbum(album)));
  const tracks: ArtistTrack[] = [];
  const seeds: FetchedAlbum['seeds'] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      tracks.push(...result.value.tracks);
      seeds.push(...result.value.seeds);
    } else {
      // One dead album id should cost its film, not the whole collection.
      logger.warn(
        { err: result.reason, movie: albums[index]?.movie },
        'Movie album fetch failed; skipping film',
      );
    }
  }
  seedPreviewCacheFromPlaylist(seeds);
  return tracks;
}

async function readPool(collectionId: string) {
  const rows = await db
    .select()
    .from(artistTrackPools)
    .where(
      and(
        eq(artistTrackPools.deezerArtistId, collectionId),
        eq(artistTrackPools.includeFeatures, false),
      ),
    )
    .limit(1);
  return rows[0];
}

async function writePool(collectionId: string, label: string, tracks: ArtistTrack[]) {
  const now = new Date();
  await db
    .insert(artistTrackPools)
    .values({
      deezerArtistId: collectionId,
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

const refreshing = new Set<string>();

function refreshInBackground(collectionId: string, label: string, albums: MovieAlbum[]): void {
  if (refreshing.has(collectionId)) return;
  refreshing.add(collectionId);

  void fetchAllAlbums(albums)
    .then(async (raw) => {
      const tracks = buildMoviePool(raw);
      if (tracks.length < MIN_MOVIE_TRACKS) return;
      await writePool(collectionId, label, tracks);
      logger.info({ collectionId, trackCount: tracks.length }, 'Refreshed movie pool');
    })
    .catch((err) => logger.warn({ err, collectionId }, 'Movie pool refresh failed'))
    .finally(() => refreshing.delete(collectionId));
}

/**
 * The collection's playable tracks, cached in `artist_track_pools` exactly like a category —
 * the row is keyed by an opaque text id, so a collection slug cannot collide with a numeric
 * Deezer artist id or a category slug.
 */
export async function getMovieCatalog(
  collectionId: string,
  label: string,
  albums: MovieAlbum[],
): Promise<ArtistTrack[]> {
  let stored;
  try {
    stored = await readPool(collectionId);
  } catch (err) {
    logger.warn({ err, collectionId }, 'Movie pool lookup failed; fetching live');
  }

  if (stored && stored.trackCount >= MIN_MOVIE_TRACKS) {
    const refreshAfterMs = (await getSettings()).categoryPoolRefreshHours * 60 * 60 * 1000;
    if (Date.now() - stored.fetchedAt.getTime() > refreshAfterMs) {
      void refreshInBackground(collectionId, label, albums);
    }
    return stored.tracks;
  }

  const tracks = buildMoviePool(await fetchAllAlbums(albums));
  if (tracks.length < MIN_MOVIE_TRACKS) {
    throw new Error(`Not enough playable tracks in ${label}`);
  }

  try {
    await writePool(collectionId, label, tracks);
  } catch (err) {
    logger.warn({ err, collectionId }, 'Failed to store movie pool');
  }
  return tracks;
}

export const __testing = { buildMoviePool, isNonSong };
