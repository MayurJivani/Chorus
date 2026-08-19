import { describe, it, expect, beforeEach, vi } from 'vitest';

const catalogMocks = vi.hoisted(() => ({ getCategoryCatalog: vi.fn() }));
vi.mock('../../src/services/categoryCatalogService', () => catalogMocks);

import {
  buildYearOptions,
  clearEraPoolCache,
  ERA_OPTION_COUNT,
  eraYearCategories,
  getEraPool,
  requireEraPool,
  EraUnavailableError,
} from '../../src/services/eraService';

function track(id: string) {
  return {
    deezerTrackId: id,
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    albumArtUrl: null,
    durationSeconds: 200,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearEraPoolCache();
});

describe('eraYearCategories', () => {
  it('finds the year categories and reads their year from the slug', () => {
    const years = eraYearCategories();
    expect(years.length).toBeGreaterThan(10);
    expect(years.every((y) => y.categoryId === `year-${y.year}`)).toBe(true);
    // Ascending, which the option builder relies on for "nearby" to mean anything.
    expect(years.map((y) => y.year)).toEqual([...years.map((y) => y.year)].sort((a, b) => a - b));
  });

  it('excludes categories that are not years', () => {
    expect(eraYearCategories().some((y) => y.categoryId === 'now-worldwide')).toBe(false);
  });
});

describe('getEraPool', () => {
  it('tags each track with the year of the list it came from', async () => {
    const years = eraYearCategories();
    catalogMocks.getCategoryCatalog.mockImplementation((id: string) =>
      Promise.resolve(id === `year-${years[0]!.year}` ? [track('a'), track('b')] : []),
    );

    const pool = await getEraPool();
    expect(pool).toHaveLength(2);
    expect(pool.every((t) => t.releaseYear === years[0]!.year)).toBe(true);
  });

  /**
   * The correctness story for the whole mode. A song charting across New Year appears in two
   * "Top Hits" lists, and there is no defensible answer for it — marking someone wrong for
   * saying 2019 about a song filed under both 2019 and 2020 is the mode being broken.
   */
  it('drops a track that appears in more than one year', async () => {
    const years = eraYearCategories();
    const [first, second] = [years[0]!.year, years[1]!.year];

    catalogMocks.getCategoryCatalog.mockImplementation((id: string) => {
      if (id === `year-${first}`) return Promise.resolve([track('shared'), track('only-first')]);
      if (id === `year-${second}`) return Promise.resolve([track('shared')]);
      return Promise.resolve([]);
    });

    const pool = await getEraPool();

    expect(pool.map((t) => t.deezerTrackId)).toEqual(['only-first']);
    expect(pool[0]!.releaseYear).toBe(first);
  });

  it('keeps going when one year is unavailable', async () => {
    const years = eraYearCategories();
    catalogMocks.getCategoryCatalog.mockImplementation((id: string) => {
      if (id === `year-${years[0]!.year}`) return Promise.reject(new Error('Deezer down'));
      return Promise.resolve([track(`t-${id}`)]);
    });

    const pool = await getEraPool();
    expect(pool.length).toBe(years.length - 1);
  });
});

describe('requireEraPool', () => {
  it('refuses to serve a pool too small to build decoys from', async () => {
    catalogMocks.getCategoryCatalog.mockResolvedValue([track('a')]);
    await expect(requireEraPool()).rejects.toBeInstanceOf(EraUnavailableError);
  });
});

describe('buildYearOptions', () => {
  const years = Array.from({ length: 24 }, (_, i) => 2000 + i);

  it('always includes the answer, ascending, with no duplicates', () => {
    const options = buildYearOptions(2012, years);

    expect(options).toContain(2012);
    expect(options).toHaveLength(ERA_OPTION_COUNT);
    expect(new Set(options).size).toBe(ERA_OPTION_COUNT);
    expect(options).toEqual([...options].sort((a, b) => a - b));
  });

  it('prefers nearby decoys, so the round is a judgement not a giveaway', () => {
    // Spread decoys across two decades and anyone can hear which is which; clustering them
    // forces the player to actually place the record.
    for (let i = 0; i < 20; i += 1) {
      const options = buildYearOptions(2012, years);
      for (const year of options) {
        expect(Math.abs(year - 2012)).toBeLessThanOrEqual(6);
      }
    }
  });

  it('falls back to distant years when the range is too thin to stay close', () => {
    const sparse = [1990, 2000, 2012, 2024];
    const options = buildYearOptions(2012, sparse);

    expect(options).toContain(2012);
    expect(options).toHaveLength(ERA_OPTION_COUNT);
  });

  it('copes when there are barely any years to choose from', () => {
    const options = buildYearOptions(2012, [2012, 2013]);
    expect(options).toEqual([2012, 2013]);
  });
});
