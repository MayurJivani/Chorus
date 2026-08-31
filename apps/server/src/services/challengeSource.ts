/**
 * What a ten-round challenge is built from.
 *
 * Artist Mode and Category Mode play identically — same rounds, same snippet schedule, same
 * sessions and leaderboards — and differ only in where the candidate tracks come from and what
 * the run is labelled. Describing that difference as data lets both modes share one copy of the
 * challenge machinery instead of maintaining two that drift apart.
 *
 * `sourceId` is the challenge's identity in the database. Artist runs store a numeric Deezer
 * artist id, category runs a slug like "year-2024", so the two can never collide even though
 * they share a column — but nothing should ever infer the kind by inspecting the string.
 * `sourceType` is the only thing that decides that.
 */
import { getArtistById, type ArtistTrack } from './deezerService';
import { getArtistCatalog } from './artistCatalogService';
import { getCategoryCatalog } from './categoryCatalogService';
import { findCategory, isMovieCategory } from './categories';

export type ChallengeSourceType = 'artist' | 'category' | 'era' | 'daily';

export interface ChallengeSource {
  sourceType: ChallengeSourceType;
  /** Deezer artist id (as a string) or category slug. Stored in `artist_challenges`. */
  sourceId: string;
  /** Shown as the challenge's name — the artist's name, or the category label. */
  label: string;
  /** Artwork for the round screen; categories have none. */
  pictureUrl: string | null;
  /**
   * Part of a challenge's identity for artists, where it changes which tracks are eligible.
   * Always false for categories: every track there is by a different artist, so filtering on
   * "feat." would only throw away legitimate songs.
   */
  includeFeatures: boolean;
  /**
   * True for Guess the Movie sources, where a track's `title` is the *film* and its `artist`
   * holds the song. Options must hide `artist` for these, or a player who recognises the track
   * by ear reads the answer off the option list instead of naming the film.
   */
  answerIsMovie: boolean;
  /** The full playable pool the ten rounds are drawn from, and that decoys/search read. */
  loadCatalog: () => Promise<ArtistTrack[]>;
}

export async function resolveArtistSource(
  artistId: number,
  includeFeatures: boolean,
): Promise<ChallengeSource> {
  const catalogPromise = getArtistCatalog(artistId, includeFeatures);
  const artist = await getArtistById(artistId);
  if (!artist) throw new Error('Artist not found');

  return {
    sourceType: 'artist',
    sourceId: String(artistId),
    label: artist.name,
    pictureUrl: artist.pictureUrl,
    includeFeatures,
    answerIsMovie: false,
    loadCatalog: () => catalogPromise,
  };
}

export function resolveCategorySource(categoryId: string): ChallengeSource {
  const category = findCategory(categoryId);
  if (!category) throw new Error('Unknown category');

  return {
    sourceType: 'category',
    sourceId: category.id,
    label: category.label,
    pictureUrl: null,
    includeFeatures: false,
    answerIsMovie: isMovieCategory(category),
    loadCatalog: () => getCategoryCatalog(category.id),
  };
}

const DAILY_POOL_CATEGORIES = [
  'now-worldwide',
  'year-2025',
  'year-2023',
  'year-2020',
  'year-2015',
  'year-2010',
  'year-2005',
  'year-2000',
];

export function resolveDailySource(_dateStr: string): ChallengeSource {
  return {
    sourceType: 'daily',
    sourceId: 'daily',
    label: 'Daily Challenge',
    pictureUrl: null,
    includeFeatures: false,
    answerIsMovie: false,
    loadCatalog: async () => {
      const validIds = DAILY_POOL_CATEGORIES.filter((id) => findCategory(id));
      const pools = await Promise.all(validIds.map((id) => getCategoryCatalog(id)));
      const seen = new Set<string>();
      const merged: ArtistTrack[] = [];
      for (const pool of pools) {
        for (const track of pool) {
          if (!seen.has(track.deezerTrackId)) {
            seen.add(track.deezerTrackId);
            merged.push(track);
          }
        }
      }
      return merged;
    },
  };
}
