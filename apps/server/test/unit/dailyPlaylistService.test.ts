import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { dailyPuzzles, gameResults, songs } from '../../src/db/schema';
import {
  DAILY_PLAYLISTS,
  fetchPlaylistTracks,
  syncDailyPlaylists,
  ensureDailyPlaylistsFresh,
} from '../../src/services/dailyPlaylistService';

beforeEach(async () => {
  // Delete in dependency order: daily_puzzles references songs (and game_results references
  // daily_puzzles), so rows left by another test file would block the songs cleanup.
  await db.delete(gameResults);
  await db.delete(dailyPuzzles);
  await db.delete(songs);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function playlistPage(...tracks: Record<string, unknown>[]) {
  return { ok: true, json: async () => ({ data: tracks, next: null }) };
}

async function seedSong(deezerTrackId: string) {
  const [song] = await db
    .insert(songs)
    .values({
      title: 'Seeded Song',
      artist: 'Seeded Artist',
      deezerTrackId,
      previewUrl: 'https://example.test/seeded.mp3',
      durationSeconds: 180,
    })
    .returning();
  return song;
}

describe('fetchPlaylistTracks', () => {
  it('maps Deezer track fields and skips tracks without a preview', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        playlistPage(
          {
            id: 111,
            title: 'Shine On You Crazy Diamond',
            preview: 'https://example.test/a.mp3',
            duration: 775,
            artist: { name: 'Pink Floyd' },
            album: { cover_medium: 'https://example.test/art.jpg' },
          },
          { id: 222, title: 'No Preview Here', duration: 100 },
        ),
      ),
    );

    const tracks = await fetchPlaylistTracks('0000000000');
    expect(tracks).toEqual([
      {
        deezerTrackId: '111',
        title: 'Shine On You Crazy Diamond',
        artist: 'Pink Floyd',
        albumArtUrl: 'https://example.test/art.jpg',
        durationSeconds: 775,
        previewUrl: 'https://example.test/a.mp3',
      },
    ]);
  });

  it('throws when a page fails so the playlist is never treated as complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchPlaylistTracks('0000000000')).rejects.toThrow();
  });
});

describe('syncDailyPlaylists', () => {
  it('upserts playlist tracks as active and deactivates songs no longer in the playlists', async () => {
    await seedSong('999');
    await seedSong('not-in-playlist');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        playlistPage({
          id: 999,
          title: 'Current Hit',
          preview: 'https://example.test/hit.mp3',
          duration: 200,
          artist: { name: 'Some Artist' },
          album: { cover_medium: 'https://example.test/art.jpg' },
        }),
      ),
    );

    const result = await syncDailyPlaylists();
    expect(result.failedPlaylists).toBe(0);
    expect(result.totalTracks).toBe(1);

    const hit = await db.select().from(songs).where(eq(songs.deezerTrackId, '999')).limit(1);
    expect(hit[0]?.active).toBe(true);
    expect(hit[0]?.title).toBe('Current Hit');
    expect(hit[0]?.albumArtUrl).toBe('https://example.test/art.jpg');

    const stale = await db
      .select()
      .from(songs)
      .where(eq(songs.deezerTrackId, 'not-in-playlist'))
      .limit(1);
    expect(stale[0]?.active).toBe(false);
  });

  it('keeps manual_override songs active even when they leave the playlists', async () => {
    await db
      .insert(songs)
      .values({
        title: 'Pinned Hit',
        artist: 'Curated Artist',
        deezerTrackId: 'pinned',
        previewUrl: 'https://example.test/pinned.mp3',
        durationSeconds: 200,
        active: true,
        manualOverride: true,
      })
      .returning();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        playlistPage({
          id: 999,
          title: 'Current Hit',
          preview: 'https://example.test/hit.mp3',
          duration: 200,
          artist: { name: 'Some Artist' },
        }),
      ),
    );

    await syncDailyPlaylists();

    const row = await db.select().from(songs).where(eq(songs.deezerTrackId, 'pinned')).limit(1);
    expect(row[0]?.active).toBe(true);
  });

  it('does not force-reactivate a manual_override song present in the playlists', async () => {
    await db
      .insert(songs)
      .values({
        title: 'Deactivated Pinned',
        artist: 'Curated Artist',
        deezerTrackId: '999',
        previewUrl: 'https://example.test/old.mp3',
        durationSeconds: 200,
        active: false,
        manualOverride: true,
      })
      .returning();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        playlistPage({
          id: 999,
          title: 'Current Hit',
          preview: 'https://example.test/hit.mp3',
          duration: 200,
          artist: { name: 'Some Artist' },
        }),
      ),
    );

    await syncDailyPlaylists();

    const row = await db.select().from(songs).where(eq(songs.deezerTrackId, '999')).limit(1);
    expect(row[0]?.active).toBe(false);
  });

  it('does not deactivate anything when a playlist fetch fails', async () => {
    await seedSong('keep-me');
    const failingId = DAILY_PLAYLISTS[0]?.id;

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(`playlist/${failingId}/tracks`)) {
        return { ok: false };
      }
      return playlistPage({
        id: 555,
        title: 'Fine Track',
        preview: 'https://example.test/fine.mp3',
        duration: 190,
        artist: { name: 'Some Artist' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncDailyPlaylists();
    expect(result.failedPlaylists).toBeGreaterThan(0);

    const row = await db.select().from(songs).where(eq(songs.deezerTrackId, 'keep-me')).limit(1);
    expect(row[0]?.active).toBe(true);
  });
});

describe('ensureDailyPlaylistsFresh', () => {
  it('is a no-op in the test environment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await ensureDailyPlaylistsFresh();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('syncs when no song has a recent verified_at', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          playlistPage({
            id: 777,
            title: 'Fresh Hit',
            preview: 'https://example.test/fresh.mp3',
            duration: 190,
            artist: { name: 'Some Artist' },
          }),
        ),
      );

      // The sync is detached from the caller so no player ever waits on it; pass
      // `awaitCompletion` to observe its effect here.
      await ensureDailyPlaylistsFresh(true);

      const rows = await db.select().from(songs).where(eq(songs.deezerTrackId, '777')).limit(1);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.active).toBe(true);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });
});
