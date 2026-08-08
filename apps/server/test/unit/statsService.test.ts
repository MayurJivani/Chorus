import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { userStats, gameResults, dailyPuzzles, songs, users } from '../../src/db/schema';
import {
  recordGameResult,
  getStats,
  getSolveTimeStats,
  mergeGuestStatsIntoUser,
} from '../../src/services/statsService';

beforeEach(async () => {
  await db.delete(gameResults);
  await db.delete(userStats);
  await db.delete(dailyPuzzles);
  await db.delete(songs);
  await db.delete(users);
});

describe('recordGameResult', () => {
  it('starts a streak of 1 on a first win', async () => {
    await recordGameResult({
      ownerKey: 'guest-1',
      puzzleDate: '2026-01-01',
      won: true,
      guessesUsed: 3,
    });

    const stats = await getStats('guest-1');
    expect(stats?.currentStreak).toBe(1);
    expect(stats?.maxStreak).toBe(1);
    expect(stats?.gamesPlayed).toBe(1);
    expect(stats?.gamesWon).toBe(1);
    expect(stats?.guessDist3).toBe(1);
  });

  it('continues the streak when the previous day was also played and won', async () => {
    await recordGameResult({
      ownerKey: 'guest-2',
      puzzleDate: '2026-01-01',
      won: true,
      guessesUsed: 2,
    });
    await recordGameResult({
      ownerKey: 'guest-2',
      puzzleDate: '2026-01-02',
      won: true,
      guessesUsed: 4,
    });

    const stats = await getStats('guest-2');
    expect(stats?.currentStreak).toBe(2);
    expect(stats?.maxStreak).toBe(2);
    expect(stats?.guessDist2).toBe(1);
    expect(stats?.guessDist4).toBe(1);
  });

  it('resets the streak to 0 on a loss but keeps max streak', async () => {
    await recordGameResult({
      ownerKey: 'guest-3',
      puzzleDate: '2026-01-01',
      won: true,
      guessesUsed: 1,
    });
    await recordGameResult({
      ownerKey: 'guest-3',
      puzzleDate: '2026-01-02',
      won: false,
      guessesUsed: 6,
    });

    const stats = await getStats('guest-3');
    expect(stats?.currentStreak).toBe(0);
    expect(stats?.maxStreak).toBe(1);
    expect(stats?.gamesPlayed).toBe(2);
    expect(stats?.gamesWon).toBe(1);
  });

  it('resets the streak to 1 (not continues) when a day was skipped', async () => {
    await recordGameResult({
      ownerKey: 'guest-4',
      puzzleDate: '2026-01-01',
      won: true,
      guessesUsed: 1,
    });
    await recordGameResult({
      ownerKey: 'guest-4',
      puzzleDate: '2026-01-05',
      won: true,
      guessesUsed: 1,
    });

    const stats = await getStats('guest-4');
    expect(stats?.currentStreak).toBe(1);
    expect(stats?.maxStreak).toBe(1);
  });
});

describe('getStats', () => {
  it('returns null for an identity with no history', async () => {
    expect(await getStats('nobody')).toBeNull();
  });
});

describe('mergeGuestStatsIntoUser', () => {
  it('moves a guest stats row onto the new user and updates game_results ownership', async () => {
    const [song] = await db
      .insert(songs)
      .values({
        title: 'Song',
        artist: 'Artist',
        deezerTrackId: 'track-x',
        previewUrl: 'https://example.test/preview.mp3',
        durationSeconds: 180,
      })
      .returning();
    const [puzzle] = await db
      .insert(dailyPuzzles)
      .values({ puzzleDate: '2026-01-01', songId: song!.id })
      .returning();
    await db.insert(users).values({
      id: 'user-5',
      email: 'merge-test@example.com',
      passwordHash: 'x',
      displayName: 'Merge Test',
    });

    await recordGameResult({
      ownerKey: 'guest-5',
      puzzleDate: '2026-01-01',
      won: true,
      guessesUsed: 2,
    });
    await db.insert(gameResults).values({
      userId: null,
      guestId: 'guest-5',
      puzzleId: puzzle!.id,
      won: true,
      guessesUsed: 2,
      snippetStageReached: 1,
    });

    await mergeGuestStatsIntoUser('guest-5', 'user-5');

    expect(await getStats('guest-5')).toBeNull();
    expect((await getStats('user-5'))?.gamesWon).toBe(1);

    const results = await db.select().from(gameResults);
    expect(results[0]?.userId).toBe('user-5');
  });

  it('does nothing when the guest has no stats to merge', async () => {
    await expect(mergeGuestStatsIntoUser('no-guest', 'user-6')).resolves.toBeUndefined();
    expect(await getStats('user-6')).toBeNull();
  });
});

describe('getSolveTimeStats', () => {
  const ownerKey = 'guest-timing';

  async function seedPuzzleAndResult(opts: {
    n: number;
    won: boolean;
    guessesUsed: number;
    snippetStageReached: number;
    timeTakenSeconds: number | null;
  }) {
    const [song] = await db
      .insert(songs)
      .values({
        title: `Timed ${opts.n}`,
        artist: `Artist ${opts.n}`,
        deezerTrackId: `timed-${opts.n}`,
        previewUrl: `https://example.test/${opts.n}.mp3`,
        durationSeconds: 180,
      })
      .returning();
    const [puzzle] = await db
      .insert(dailyPuzzles)
      .values({ puzzleDate: `2026-07-${String(opts.n).padStart(2, '0')}`, songId: song!.id })
      .returning();
    await db.insert(gameResults).values({
      guestId: ownerKey,
      puzzleId: puzzle!.id,
      won: opts.won,
      guessesUsed: opts.guessesUsed,
      snippetStageReached: opts.snippetStageReached,
      timeTakenSeconds: opts.timeTakenSeconds,
    });
  }

  it('reports averages, extrema and totals as numbers', async () => {
    await seedPuzzleAndResult({
      n: 1,
      won: true,
      guessesUsed: 2,
      snippetStageReached: 1,
      timeTakenSeconds: 20,
    });
    await seedPuzzleAndResult({
      n: 2,
      won: true,
      guessesUsed: 4,
      snippetStageReached: 3,
      timeTakenSeconds: 40,
    });
    await seedPuzzleAndResult({
      n: 3,
      won: false,
      guessesUsed: 6,
      snippetStageReached: 5,
      timeTakenSeconds: 90,
    });

    const stats = await getSolveTimeStats(ownerKey);

    // AVG returns Postgres numeric, which arrives as a string — these must be parsed numbers.
    expect(typeof stats.averageSolveSeconds).toBe('number');
    expect(stats.averageSolveSeconds).toBe(30); // (20 + 40) / 2, losses excluded
    expect(stats.fastestSolveSeconds).toBe(20);
    expect(stats.slowestSolveSeconds).toBe(40);
    expect(stats.totalPlaySeconds).toBe(150); // includes the loss
    expect(stats.timedWins).toBe(2);
    expect(stats.averageGuessesPerWin).toBe(3); // (2 + 4) / 2
  });

  it('excludes results with no recorded time from the averages', async () => {
    await seedPuzzleAndResult({
      n: 4,
      won: true,
      guessesUsed: 1,
      snippetStageReached: 0,
      timeTakenSeconds: null,
    });
    await seedPuzzleAndResult({
      n: 5,
      won: true,
      guessesUsed: 3,
      snippetStageReached: 2,
      timeTakenSeconds: 60,
    });

    const stats = await getSolveTimeStats(ownerKey);

    expect(stats.averageSolveSeconds).toBe(60);
    expect(stats.timedWins).toBe(1);
    // Guess averages still cover every win, timed or not.
    expect(stats.averageGuessesPerWin).toBe(2);
  });

  it('returns nulls rather than NaN for a player with no history', async () => {
    const stats = await getSolveTimeStats('nobody-at-all');

    expect(stats.averageSolveSeconds).toBeNull();
    expect(stats.fastestSolveSeconds).toBeNull();
    expect(stats.averageGuessesPerWin).toBeNull();
    expect(stats.totalPlaySeconds).toBe(0);
    expect(stats.timedWins).toBe(0);
  });
});
