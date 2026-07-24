import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { dailyPuzzles, songs } from '../db/schema';
import { hashString } from '../utils/deterministic';

/** Seconds of audio revealed at each guess stage — six stages for six guesses, Heardle-style. */
export const SNIPPET_SCHEDULE_SECONDS = [1, 2, 4, 7, 11, 16] as const;
export const MAX_GUESSES = SNIPPET_SCHEDULE_SECONDS.length;

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getOrCreateDailyPuzzle(puzzleDate: string) {
  const existing = db
    .select()
    .from(dailyPuzzles)
    .where(eq(dailyPuzzles.puzzleDate, puzzleDate))
    .get();
  if (existing) {
    return existing;
  }

  const activeSongs = db.select({ id: songs.id }).from(songs).where(eq(songs.active, true)).all();
  if (activeSongs.length === 0) {
    throw new Error('No active songs available to build a daily puzzle');
  }

  // Never repeat a song until every other active song has had a turn: exclude whatever was
  // used in the most recent (activeCount - 1) days from today's candidate pool. This window
  // is recomputed from the *current* active count every call, so it self-heals as songs are
  // added/deactivated by the curation scripts over time.
  const recentWindow = Math.max(0, activeSongs.length - 1);
  const recentlyUsed =
    recentWindow > 0
      ? db
          .select({ songId: dailyPuzzles.songId })
          .from(dailyPuzzles)
          .orderBy(desc(dailyPuzzles.puzzleDate))
          .limit(recentWindow)
          .all()
      : [];
  const recentlyUsedIds = new Set(recentlyUsed.map((r) => r.songId));

  const candidates = activeSongs.filter((s) => !recentlyUsedIds.has(s.id));
  const pool = candidates.length > 0 ? candidates : activeSongs;

  const offset = hashString(puzzleDate) % pool.length;
  const chosen = pool[offset];
  if (!chosen) {
    throw new Error('Failed to select a song for the daily puzzle');
  }

  const inserted = db
    .insert(dailyPuzzles)
    .values({ puzzleDate, songId: chosen.id })
    .returning()
    .get();

  return inserted;
}

export function getSongById(songId: number) {
  return db.select().from(songs).where(eq(songs.id, songId)).get() ?? null;
}
