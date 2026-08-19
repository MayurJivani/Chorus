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
import { findCategory } from './categories';

export type ChallengeSourceType = 'artist' | 'category' | 'era';

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
  /** The full playable pool the ten rounds are drawn from, and that decoys/search read. */
  loadCatalog: () => Promise<ArtistTrack[]>;
}

export async function resolveArtistSource(
  artistId: number,
  includeFeatures: boolean,
): Promise<ChallengeSource> {
  const artist = await getArtistById(artistId);
  if (!artist) throw new Error('Artist not found');

  return {
    sourceType: 'artist',
    sourceId: String(artistId),
    label: artist.name,
    pictureUrl: artist.pictureUrl,
    includeFeatures,
    loadCatalog: () => getArtistCatalog(artistId, includeFeatures),
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
    loadCatalog: () => getCategoryCatalog(category.id),
  };
}
