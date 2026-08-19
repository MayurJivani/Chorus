import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { dailyPuzzles, dailyPuzzleStarts, songs } from '../db/schema';
import { hashString } from '../utils/deterministic';
import { getSettings } from './settingsService';

/**
 * The default snippet schedule: seconds of audio revealed at each guess stage, Heardle-style.
 *
 * Kept as a constant because it is the fallback the settings service returns when nothing is
 * stored, and because a few places (request validation built at import time) need *some* bound
 * before any await is possible. The live schedule comes from `getSnippetSchedule()`.
 */
export const SNIPPET_SCHEDULE_SECONDS = [1, 2, 4, 7, 11, 16] as const;
export const MAX_GUESSES = SNIPPET_SCHEDULE_SECONDS.length;

/** The largest guess count any schedule may produce; bounds request validation, which cannot
 *  await the current setting. Anything above the live schedule length is rejected afterwards. */
export const MAX_GUESSES_LIMIT = 10;

/** The snippet schedule currently in force. */
export async function getSnippetSchedule(): Promise<number[]> {
  return (await getSettings()).snippetScheduleSeconds;
}

/** Seconds of audio a given (1-based) guess number is allowed to hear. */
export function snippetSecondsForGuess(guessNumber: number, schedule: readonly number[]): number {
  return (
    schedule[Math.min(guessNumber, schedule.length) - 1] ?? schedule[schedule.length - 1] ?? 16
  );
}

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Candidate songs for the daily puzzle, ordered by id.
 *
 * The ORDER BY is load-bearing, not cosmetic: the song is chosen by indexing into this array
 * with a hash of the date, and Postgres makes no ordering guarantee without it. Row order can
 * shift after any UPDATE (the chart sync rewrites `active`/`verified_at` constantly), so the
 * "deterministic" pick would quietly resolve to a different song from one day to the next.
 */
async function selectPool(curatedOnly: boolean) {
  return db
    .select({ id: songs.id })
    .from(songs)
    .where(
      curatedOnly
        ? and(eq(songs.active, true), eq(songs.manualOverride, true))
        : eq(songs.active, true),
    )
    .orderBy(asc(songs.id));
}

export async function getOrCreateDailyPuzzle(puzzleDate: string) {
  const existingRows = await db
    .select()
    .from(dailyPuzzles)
    .where(eq(dailyPuzzles.puzzleDate, puzzleDate))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    return existing;
  }

  // The bank holds two very different populations: a hand-curated all-time list
  // (`manual_override`) and whatever is currently on Deezer's worldwide chart, which the
  // playlist sync rotates in and out. Only the curated list is eligible for the daily puzzle
  // — chart entries turn over constantly, so a shared "song of the day" drawn from them
  // would often be something most players have never heard. The chart sync still keeps the
  // bank fresh; it just doesn't decide the daily. If curation hasn't run yet, fall back to
  // every active song so the game degrades instead of failing.
  const { dailyCuratedOnly } = await getSettings();
  const curatedSongs = dailyCuratedOnly ? await selectPool(true) : [];
  const activeSongs = curatedSongs.length > 0 ? curatedSongs : await selectPool(false);
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
      ? await db
          .select({ songId: dailyPuzzles.songId })
          .from(dailyPuzzles)
          .orderBy(desc(dailyPuzzles.puzzleDate))
          .limit(recentWindow)
      : [];
  const recentlyUsedIds = new Set(recentlyUsed.map((r) => r.songId));

  const candidates = activeSongs.filter((s) => !recentlyUsedIds.has(s.id));
  const pool = candidates.length > 0 ? candidates : activeSongs;

  const offset = hashString(puzzleDate) % pool.length;
  const chosen = pool[offset];
  if (!chosen) {
    throw new Error('Failed to select a song for the daily puzzle');
  }

  // At the UTC rollover several players hit this path at once. `puzzle_date` is unique, so
  // only one insert can win; the losers get no row back and simply read the winner's puzzle
  // instead of erroring — everyone still ends up on the same song.
  const insertedRows = await db
    .insert(dailyPuzzles)
    .values({ puzzleDate, songId: chosen.id })
    .onConflictDoNothing({ target: dailyPuzzles.puzzleDate })
    .returning();
  const inserted = insertedRows[0];
  if (inserted) {
    return inserted;
  }

  const racedRows = await db
    .select()
    .from(dailyPuzzles)
    .where(eq(dailyPuzzles.puzzleDate, puzzleDate))
    .limit(1);
  const raced = racedRows[0];
  if (!raced) {
    throw new Error('Failed to create the daily puzzle');
  }

  return raced;
}

/**
 * Stamps when this player first opened the puzzle, if it isn't already stamped.
 *
 * `onConflictDoNothing` is what makes the timing honest: reloading the page, or opening it in
 * a second tab, must not reset the clock, so only the first view ever wins.
 */
export async function markPuzzleStarted(ownerKey: string, puzzleId: number): Promise<void> {
  await db
    .insert(dailyPuzzleStarts)
    .values({ ownerKey, puzzleId })
    .onConflictDoNothing({ target: [dailyPuzzleStarts.ownerKey, dailyPuzzleStarts.puzzleId] });
}

/** Seconds between this player's first view of the puzzle and now, or null if never stamped
 *  (results predating the timing feature, or a client that went straight to guessing). */
export async function getElapsedPuzzleSeconds(
  ownerKey: string,
  puzzleId: number,
): Promise<number | null> {
  const rows = await db
    .select({ startedAt: dailyPuzzleStarts.startedAt })
    .from(dailyPuzzleStarts)
    .where(and(eq(dailyPuzzleStarts.ownerKey, ownerKey), eq(dailyPuzzleStarts.puzzleId, puzzleId)))
    .limit(1);

  const startedAt = rows[0]?.startedAt;
  if (!startedAt) return null;
  return Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
}

export async function getSongById(songId: number) {
  const rows = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
  return rows[0] ?? null;
}
