/**
 * Era mode: hear a song, name the year it came from.
 *
 * Deezer's track listings carry no release date — only the per-track and per-album endpoints do,
 * and looking up a date for every candidate would burn the request budget for a mode that needs
 * hundreds of them. The year categories already solve this: a track in "Top Hits 2004" is a 2004
 * song by editorial definition, which is both free and more truthful than an album date, since
 * reissues and anniversary editions report the *reissue* year and would date half a catalogue
 * wrong.
 */
import { CATEGORIES } from './categories';
import { getCategoryCatalog } from './categoryCatalogService';
import type { ArtistTrack } from './deezerService';
import { logger } from '../logger';

/** Slugs are `year-YYYY`; this is the only place that relationship is relied upon. */
const YEAR_CATEGORY_PATTERN = /^year-(\d{4})$/;

export function eraYearCategories(): { categoryId: string; year: number }[] {
  return CATEGORIES.flatMap((category) => {
    const match = YEAR_CATEGORY_PATTERN.exec(category.id);
    return match ? [{ categoryId: category.id, year: Number(match[1]) }] : [];
  }).sort((a, b) => a.year - b.year);
}

/** Enough distinct years for the option builder to have decoys to work with. */
const MIN_ERA_TRACKS = 40;

let cached: { tracks: ArtistTrack[]; expiresAt: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export function clearEraPoolCache(): void {
  cached = null;
}

/**
 * Every track that belongs to exactly one year.
 *
 * The ambiguity filter is the whole correctness story. A song that charts across a new year
 * appears in two "Top Hits" lists, and there is no defensible answer for it — marking a player
 * wrong for saying 2019 about a song Deezer files under both 2019 and 2020 is the mode being
 * broken, not the player. Those tracks are dropped rather than assigned an arbitrary year.
 */
export async function getEraPool(): Promise<ArtistTrack[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.tracks;

  const years = eraYearCategories();
  const catalogs = await Promise.all(
    years.map(async ({ categoryId, year }) => {
      try {
        return { year, tracks: await getCategoryCatalog(categoryId) };
      } catch (err) {
        // One unavailable year narrows the pool; it must not empty it.
        logger.warn({ err, categoryId }, 'Era pool: year unavailable, skipping');
        return { year, tracks: [] as ArtistTrack[] };
      }
    }),
  );

  const yearsByTrackId = new Map<string, Set<number>>();
  const trackById = new Map<string, ArtistTrack>();

  for (const { year, tracks } of catalogs) {
    for (const track of tracks) {
      const seen = yearsByTrackId.get(track.deezerTrackId) ?? new Set<number>();
      seen.add(year);
      yearsByTrackId.set(track.deezerTrackId, seen);
      trackById.set(track.deezerTrackId, track);
    }
  }

  const unambiguous: ArtistTrack[] = [];
  let dropped = 0;
  for (const [trackId, seenYears] of yearsByTrackId) {
    if (seenYears.size !== 1) {
      dropped += 1;
      continue;
    }
    const track = trackById.get(trackId);
    if (track) unambiguous.push({ ...track, releaseYear: [...seenYears][0] });
  }

  logger.info(
    { total: yearsByTrackId.size, usable: unambiguous.length, dropped },
    'Built era pool',
  );

  if (unambiguous.length >= MIN_ERA_TRACKS) {
    cached = { tracks: unambiguous, expiresAt: Date.now() + CACHE_MS };
  }
  return unambiguous;
}

export class EraUnavailableError extends Error {}

export async function requireEraPool(): Promise<ArtistTrack[]> {
  const pool = await getEraPool();
  if (pool.length < MIN_ERA_TRACKS) {
    throw new EraUnavailableError('Era mode is warming up — please try again shortly');
  }
  return pool;
}

/** How many years are offered per round, the answer included. */
export const ERA_OPTION_COUNT = 4;

/**
 * Four candidate years: the answer plus decoys drawn from nearby years where possible.
 *
 * Nearby matters. Decoys spread across the whole range turn the round into "is this song from
 * 2002 or 2021", which anyone can hear; clustering them makes the player actually place the
 * record. Falls back to distant years only when the range is too thin to do better.
 */
export function buildYearOptions(
  correctYear: number,
  availableYears: readonly number[],
  random: () => number = Math.random,
): number[] {
  const others = [...new Set(availableYears)].filter((year) => year !== correctYear);

  const near = others
    .filter((year) => Math.abs(year - correctYear) <= 6)
    .sort(() => random() - 0.5);
  const far = others.filter((year) => Math.abs(year - correctYear) > 6).sort(() => random() - 0.5);

  const decoys = [...near, ...far].slice(0, ERA_OPTION_COUNT - 1);

  return [correctYear, ...decoys].sort((a, b) => a - b);
}
