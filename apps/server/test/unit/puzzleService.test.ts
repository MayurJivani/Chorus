import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { songs, dailyPuzzles, gameResults, userStats } from '../../src/db/schema';
import {
  getOrCreateDailyPuzzle,
  getUtcDateString,
  previewUpcomingPuzzles,
  SNIPPET_SCHEDULE_SECONDS,
} from '../../src/services/puzzleService';

async function seedSong(n: number) {
  const [song] = await db
    .insert(songs)
    .values({
      title: `Song ${n}`,
      artist: `Artist ${n}`,
      deezerTrackId: `track-${n}`,
      previewUrl: `https://example.test/preview-${n}.mp3`,
      durationSeconds: 180,
    })
    .returning();
  return song;
}

beforeEach(async () => {
  // Delete in dependency order: game_results references daily_puzzles, and rows left behind
  // by another test file would otherwise make this cleanup fail on a foreign key.
  await db.delete(gameResults);
  await db.delete(userStats);
  await db.delete(dailyPuzzles);
  await db.delete(songs);
});

describe('getUtcDateString', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    const date = new Date('2026-03-05T23:59:59Z');
    expect(getUtcDateString(date)).toBe('2026-03-05');
  });
});

describe('SNIPPET_SCHEDULE_SECONDS', () => {
  it('has six increasing stages', () => {
    expect(SNIPPET_SCHEDULE_SECONDS).toHaveLength(6);
    for (let i = 1; i < SNIPPET_SCHEDULE_SECONDS.length; i += 1) {
      const current = SNIPPET_SCHEDULE_SECONDS[i]!;
      const previous = SNIPPET_SCHEDULE_SECONDS[i - 1]!;
      expect(current).toBeGreaterThan(previous);
    }
  });
});

describe('getOrCreateDailyPuzzle', () => {
  it('throws when there are no active songs', async () => {
    await expect(getOrCreateDailyPuzzle('2026-01-01')).rejects.toThrow();
  });

  it('deterministically returns the same song for the same date', async () => {
    for (let i = 0; i < 5; i += 1) await seedSong(i);

    const first = await getOrCreateDailyPuzzle('2026-01-01');
    const second = await getOrCreateDailyPuzzle('2026-01-01');

    expect(second.id).toBe(first.id);
    expect(second.songId).toBe(first.songId);
  });

  it('only ever creates one row per date', async () => {
    for (let i = 0; i < 5; i += 1) await seedSong(i);

    await getOrCreateDailyPuzzle('2026-02-14');
    await getOrCreateDailyPuzzle('2026-02-14');

    const rows = await db.select().from(dailyPuzzles);
    expect(rows).toHaveLength(1);
  });

  function dateAt(offsetDays: number): string {
    const base = new Date('2026-04-01T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return getUtcDateString(base);
  }

  it('never repeats a song until every other active song has had a turn', async () => {
    const songCount = 8;
    for (let i = 0; i < songCount; i += 1) await seedSong(i);

    const usedSongIds: number[] = [];
    for (let day = 0; day < songCount; day += 1) {
      const puzzle = await getOrCreateDailyPuzzle(dateAt(day));
      usedSongIds.push(puzzle.songId);
    }

    // A full cycle of `songCount` days must use every active song exactly once.
    expect(new Set(usedSongIds).size).toBe(songCount);
  });

  it('allows repeats again once a full cycle has completed', async () => {
    const songCount = 4;
    for (let i = 0; i < songCount; i += 1) await seedSong(i);

    const firstCycle: number[] = [];
    for (let day = 0; day < songCount; day += 1) {
      firstCycle.push((await getOrCreateDailyPuzzle(dateAt(day))).songId);
    }

    // The (songCount + 1)th day should not throw, and must pick from the active set —
    // by now the exclusion window has rolled off day 0, so day 0's song is a valid pick again.
    const next = await getOrCreateDailyPuzzle(dateAt(songCount));
    expect(firstCycle).toContain(next.songId);
  });
});

describe('previewUpcomingPuzzles', () => {
  async function seedCurated(count: number) {
    await db.insert(songs).values(
      Array.from({ length: count }, (_, i) => ({
        title: `Song ${i + 1}`,
        artist: 'Tester',
        deezerTrackId: `prev-${i}`,
        previewUrl: 'https://example.test/p.mp3',
        durationSeconds: 200,
        active: true,
        manualOverride: true,
      })),
    );
  }

  it('projects a run of days without creating any of them', async () => {
    await seedCurated(10);

    const upcoming = await previewUpcomingPuzzles(5);

    expect(upcoming).toHaveLength(5);
    expect(upcoming.every((d) => !d.scheduled)).toBe(true);
    // The whole point: previewing must not pin anything.
    expect(await db.select().from(dailyPuzzles)).toEqual([]);
  });

  it('starts at today and walks forward one day at a time', async () => {
    await seedCurated(10);
    const upcoming = await previewUpcomingPuzzles(3);

    expect(upcoming[0]?.puzzleDate).toBe(getUtcDateString());
    const dayMs = 24 * 60 * 60 * 1000;
    const first = new Date(`${upcoming[0]!.puzzleDate}T00:00:00Z`).getTime();
    expect(new Date(`${upcoming[1]!.puzzleDate}T00:00:00Z`).getTime()).toBe(first + dayMs);
    expect(new Date(`${upcoming[2]!.puzzleDate}T00:00:00Z`).getTime()).toBe(first + 2 * dayMs);
  });

  /**
   * The reason the projection has to be sequential. Each day excludes recently used songs, so
   * day three's answer depends on what days one and two took — asking each date in isolation
   * would happily project the same song twice running.
   */
  it('does not repeat a song while the pool is large enough', async () => {
    await seedCurated(10);
    const upcoming = await previewUpcomingPuzzles(8);

    const ids = upcoming.map((d) => d.songId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrees with what the picker actually chooses', async () => {
    await seedCurated(10);
    const [projected] = await previewUpcomingPuzzles(1);

    const created = await getOrCreateDailyPuzzle(getUtcDateString());

    expect(created.songId).toBe(projected!.songId);
  });

  it('reports an already-created day as settled, not projected', async () => {
    await seedCurated(10);
    await getOrCreateDailyPuzzle(getUtcDateString());

    const [today] = await previewUpcomingPuzzles(1);
    expect(today?.scheduled).toBe(true);
  });

  it('re-threads later days around a pinned one', async () => {
    await seedCurated(10);
    const before = await previewUpcomingPuzzles(3);

    // Pin tomorrow to whatever the day after was going to take.
    const dayMs = 24 * 60 * 60 * 1000;
    const tomorrow = getUtcDateString(new Date(Date.now() + dayMs));
    await db.insert(dailyPuzzles).values({ puzzleDate: tomorrow, songId: before[2]!.songId! });

    const after = await previewUpcomingPuzzles(3);

    expect(after[1]?.scheduled).toBe(true);
    expect(after[1]?.songId).toBe(before[2]?.songId);
    // The day after can no longer take the song that just got pinned ahead of it.
    expect(after[2]?.songId).not.toBe(before[2]?.songId);
  });

  it('returns nothing playable when the bank is empty', async () => {
    const upcoming = await previewUpcomingPuzzles(2);
    expect(upcoming.every((d) => d.songId === null)).toBe(true);
  });
});
