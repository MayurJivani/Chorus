import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { artistTrackPools } from '../../src/db/schema';

const deezerMocks = vi.hoisted(() => ({
  getArtistTopTracks: vi.fn(),
}));

vi.mock('../../src/services/deezerService', () => deezerMocks);

import {
  getArtistCatalog,
  evictStaleArtistPools,
  clearArtistPools,
  getArtistPoolStats,
  POOL_RETENTION_MS,
} from '../../src/services/artistCatalogService';

function mockTracks(n: number, prefix = 'dz') {
  return Array.from({ length: n }, (_, i) => ({
    deezerTrackId: `${prefix}-${i}`,
    title: `Track ${i}`,
    artist: 'Queen',
    albumArtUrl: null,
    durationSeconds: 200,
  }));
}

async function setPoolTimestamps(
  deezerArtistId: string,
  values: { fetchedAt?: Date; lastAccessedAt?: Date },
): Promise<void> {
  await db
    .update(artistTrackPools)
    .set(values)
    .where(eq(artistTrackPools.deezerArtistId, deezerArtistId));
}

beforeEach(async () => {
  await clearArtistPools();
  vi.clearAllMocks();
  deezerMocks.getArtistTopTracks.mockResolvedValue(mockTracks(12));
});

describe('getArtistCatalog', () => {
  it('crawls Deezer on a miss and stores the pool', async () => {
    const tracks = await getArtistCatalog(412);

    expect(tracks).toHaveLength(12);
    expect(deezerMocks.getArtistTopTracks).toHaveBeenCalledTimes(1);

    const stored = await db
      .select()
      .from(artistTrackPools)
      .where(eq(artistTrackPools.deezerArtistId, '412'));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.trackCount).toBe(12);
    expect(stored[0]?.tracks).toHaveLength(12);
  });

  it('serves the stored pool without calling Deezer again', async () => {
    await getArtistCatalog(412);
    const again = await getArtistCatalog(412);

    expect(again).toHaveLength(12);
    // The point of the table: a restart clears the in-memory cache, but the pool survives.
    expect(deezerMocks.getArtistTopTracks).toHaveBeenCalledTimes(1);
  });

  it('keys pools separately for includeFeatures', async () => {
    deezerMocks.getArtistTopTracks.mockResolvedValueOnce(mockTracks(12, 'plain'));
    deezerMocks.getArtistTopTracks.mockResolvedValueOnce(mockTracks(20, 'feat'));

    const withoutFeatures = await getArtistCatalog(412, false);
    const withFeatures = await getArtistCatalog(412, true);

    expect(withoutFeatures).toHaveLength(12);
    expect(withFeatures).toHaveLength(20);
    expect(deezerMocks.getArtistTopTracks).toHaveBeenCalledTimes(2);

    const stored = await db
      .select()
      .from(artistTrackPools)
      .where(eq(artistTrackPools.deezerArtistId, '412'));
    expect(stored).toHaveLength(2);
  });

  it('still serves a stale pool immediately rather than making the player wait', async () => {
    await getArtistCatalog(412);
    // Older than the refresh window — the refresh is dispatched in the background, but the
    // caller must get the stored tracks straight away.
    await setPoolTimestamps('412', { fetchedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

    const tracks = await getArtistCatalog(412);
    expect(tracks).toHaveLength(12);
  });

  it('does not store a pool when the artist has no playable tracks', async () => {
    deezerMocks.getArtistTopTracks.mockResolvedValue([]);

    const tracks = await getArtistCatalog(999);

    expect(tracks).toEqual([]);
    const stored = await db
      .select()
      .from(artistTrackPools)
      .where(eq(artistTrackPools.deezerArtistId, '999'));
    expect(stored).toHaveLength(0);
  });
});

describe('evictStaleArtistPools', () => {
  it('drops pools nobody has opened within the retention window', async () => {
    await getArtistCatalog(412);
    await setPoolTimestamps('412', {
      lastAccessedAt: new Date(Date.now() - POOL_RETENTION_MS - 60_000),
    });

    const removed = await evictStaleArtistPools();

    expect(removed).toBe(1);
    expect(await getArtistPoolStats()).toEqual({ pools: 0, tracks: 0 });
  });

  it('keeps pools that are still being played', async () => {
    await getArtistCatalog(412);

    const removed = await evictStaleArtistPools();

    expect(removed).toBe(0);
    expect(await getArtistPoolStats()).toEqual({ pools: 1, tracks: 12 });
  });
});
