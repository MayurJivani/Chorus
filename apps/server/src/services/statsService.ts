import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { gameResults, userStats } from '../db/schema';

const GUESS_DIST_COLUMNS = [
  'guessDist1',
  'guessDist2',
  'guessDist3',
  'guessDist4',
  'guessDist5',
  'guessDist6',
] as const;

function yesterday(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export interface RecordResultInput {
  ownerKey: string; // userId if authenticated, else guestId
  puzzleDate: string; // 'YYYY-MM-DD'
  won: boolean;
  guessesUsed: number; // 1-6 when won, otherwise the number of attempts used before giving up
}

export function recordGameResult(input: RecordResultInput): void {
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(userStats)
      .where(eq(userStats.ownerKey, input.ownerKey))
      .get();

    const continuesStreak = existing?.lastPlayedDate === yesterday(input.puzzleDate);
    const currentStreak = input.won
      ? continuesStreak
        ? (existing?.currentStreak ?? 0) + 1
        : 1
      : 0;
    const maxStreak = Math.max(currentStreak, existing?.maxStreak ?? 0);

    const base = {
      currentStreak,
      maxStreak,
      gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
      gamesWon: (existing?.gamesWon ?? 0) + (input.won ? 1 : 0),
      lastPlayedDate: input.puzzleDate,
      updatedAt: new Date().toISOString(),
    };

    const distColumn =
      input.won && input.guessesUsed >= 1 && input.guessesUsed <= 6
        ? GUESS_DIST_COLUMNS[input.guessesUsed - 1]
        : undefined;
    const distUpdate = distColumn ? { [distColumn]: (existing?.[distColumn] ?? 0) + 1 } : {};

    if (existing) {
      tx.update(userStats)
        .set({ ...base, ...distUpdate })
        .where(eq(userStats.ownerKey, input.ownerKey))
        .run();
    } else {
      tx.insert(userStats)
        .values({ ownerKey: input.ownerKey, ...base, ...distUpdate })
        .run();
    }
  });
}

export function getStats(ownerKey: string) {
  return db.select().from(userStats).where(eq(userStats.ownerKey, ownerKey)).get() ?? null;
}

/** Migrates a guest's history onto a freshly-registered user account. */
export function mergeGuestStatsIntoUser(guestId: string, userId: string): void {
  db.transaction((tx) => {
    const guestStats = tx.select().from(userStats).where(eq(userStats.ownerKey, guestId)).get();
    const userStatsRow = tx.select().from(userStats).where(eq(userStats.ownerKey, userId)).get();

    // A brand-new account should never already have stats, but guard defensively rather than clobber.
    if (guestStats && !userStatsRow) {
      tx.insert(userStats)
        .values({ ...guestStats, ownerKey: userId })
        .run();
      tx.delete(userStats).where(eq(userStats.ownerKey, guestId)).run();
    }

    tx.update(gameResults)
      .set({ userId })
      .where(and(eq(gameResults.guestId, guestId), isNull(gameResults.userId)))
      .run();
  });
}
