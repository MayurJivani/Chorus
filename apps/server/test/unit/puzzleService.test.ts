import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { songs, dailyPuzzles } from '../../src/db/schema';
import {
  getOrCreateDailyPuzzle,
  getUtcDateString,
  SNIPPET_SCHEDULE_SECONDS,
} from '../../src/services/puzzleService';

function seedSong(n: number) {
  return db
    .insert(songs)
    .values({
      title: `Song ${n}`,
      artist: `Artist ${n}`,
      deezerTrackId: `track-${n}`,
      previewUrl: `https://example.test/preview-${n}.mp3`,
      durationSeconds: 180,
    })
    .returning()
    .get();
}

beforeEach(() => {
  db.delete(dailyPuzzles).run();
  db.delete(songs).run();
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
  it('throws when there are no active songs', () => {
    expect(() => getOrCreateDailyPuzzle('2026-01-01')).toThrow();
  });

  it('deterministically returns the same song for the same date', () => {
    for (let i = 0; i < 5; i += 1) seedSong(i);

    const first = getOrCreateDailyPuzzle('2026-01-01');
    const second = getOrCreateDailyPuzzle('2026-01-01');

    expect(second.id).toBe(first.id);
    expect(second.songId).toBe(first.songId);
  });

  it('only ever creates one row per date', () => {
    for (let i = 0; i < 5; i += 1) seedSong(i);

    getOrCreateDailyPuzzle('2026-02-14');
    getOrCreateDailyPuzzle('2026-02-14');

    const rows = db.select().from(dailyPuzzles).all();
    expect(rows).toHaveLength(1);
  });

  function dateAt(offsetDays: number): string {
    const base = new Date('2026-04-01T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + offsetDays);
    return getUtcDateString(base);
  }

  it('never repeats a song until every other active song has had a turn', () => {
    const songCount = 8;
    for (let i = 0; i < songCount; i += 1) seedSong(i);

    const usedSongIds: number[] = [];
    for (let day = 0; day < songCount; day += 1) {
      const puzzle = getOrCreateDailyPuzzle(dateAt(day));
      usedSongIds.push(puzzle.songId);
    }

    // A full cycle of `songCount` days must use every active song exactly once.
    expect(new Set(usedSongIds).size).toBe(songCount);
  });

  it('allows repeats again once a full cycle has completed', () => {
    const songCount = 4;
    for (let i = 0; i < songCount; i += 1) seedSong(i);

    const firstCycle: number[] = [];
    for (let day = 0; day < songCount; day += 1) {
      firstCycle.push(getOrCreateDailyPuzzle(dateAt(day)).songId);
    }

    // The (songCount + 1)th day should not throw, and must pick from the active set —
    // by now the exclusion window has rolled off day 0, so day 0's song is a valid pick again.
    const next = getOrCreateDailyPuzzle(dateAt(songCount));
    expect(firstCycle).toContain(next.songId);
  });
});
