import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { userStats, gameResults, dailyPuzzles, songs, users } from '../../src/db/schema';
import {
  recordGameResult,
  getStats,
  mergeGuestStatsIntoUser,
} from '../../src/services/statsService';

beforeEach(() => {
  db.delete(gameResults).run();
  db.delete(userStats).run();
  db.delete(dailyPuzzles).run();
  db.delete(songs).run();
  db.delete(users).run();
});

describe('recordGameResult', () => {
  it('starts a streak of 1 on a first win', () => {
    recordGameResult({ ownerKey: 'guest-1', puzzleDate: '2026-01-01', won: true, guessesUsed: 3 });

    const stats = getStats('guest-1');
    expect(stats?.currentStreak).toBe(1);
    expect(stats?.maxStreak).toBe(1);
    expect(stats?.gamesPlayed).toBe(1);
    expect(stats?.gamesWon).toBe(1);
    expect(stats?.guessDist3).toBe(1);
  });

  it('continues the streak when the previous day was also played and won', () => {
    recordGameResult({ ownerKey: 'guest-2', puzzleDate: '2026-01-01', won: true, guessesUsed: 2 });
    recordGameResult({ ownerKey: 'guest-2', puzzleDate: '2026-01-02', won: true, guessesUsed: 4 });

    const stats = getStats('guest-2');
    expect(stats?.currentStreak).toBe(2);
    expect(stats?.maxStreak).toBe(2);
    expect(stats?.guessDist2).toBe(1);
    expect(stats?.guessDist4).toBe(1);
  });

  it('resets the streak to 0 on a loss but keeps max streak', () => {
    recordGameResult({ ownerKey: 'guest-3', puzzleDate: '2026-01-01', won: true, guessesUsed: 1 });
    recordGameResult({ ownerKey: 'guest-3', puzzleDate: '2026-01-02', won: false, guessesUsed: 6 });

    const stats = getStats('guest-3');
    expect(stats?.currentStreak).toBe(0);
    expect(stats?.maxStreak).toBe(1);
    expect(stats?.gamesPlayed).toBe(2);
    expect(stats?.gamesWon).toBe(1);
  });

  it('resets the streak to 1 (not continues) when a day was skipped', () => {
    recordGameResult({ ownerKey: 'guest-4', puzzleDate: '2026-01-01', won: true, guessesUsed: 1 });
    recordGameResult({ ownerKey: 'guest-4', puzzleDate: '2026-01-05', won: true, guessesUsed: 1 });

    const stats = getStats('guest-4');
    expect(stats?.currentStreak).toBe(1);
    expect(stats?.maxStreak).toBe(1);
  });
});

describe('getStats', () => {
  it('returns null for an identity with no history', () => {
    expect(getStats('nobody')).toBeNull();
  });
});

describe('mergeGuestStatsIntoUser', () => {
  it('moves a guest stats row onto the new user and updates game_results ownership', () => {
    const song = db
      .insert(songs)
      .values({
        title: 'Song',
        artist: 'Artist',
        deezerTrackId: 'track-x',
        previewUrl: 'https://example.test/preview.mp3',
        durationSeconds: 180,
      })
      .returning()
      .get();
    const puzzle = db
      .insert(dailyPuzzles)
      .values({ puzzleDate: '2026-01-01', songId: song.id })
      .returning()
      .get();
    db.insert(users)
      .values({
        id: 'user-5',
        email: 'merge-test@example.com',
        passwordHash: 'x',
        displayName: 'Merge Test',
      })
      .run();

    recordGameResult({ ownerKey: 'guest-5', puzzleDate: '2026-01-01', won: true, guessesUsed: 2 });
    db.insert(gameResults)
      .values({
        userId: null,
        guestId: 'guest-5',
        puzzleId: puzzle.id,
        won: true,
        guessesUsed: 2,
        snippetStageReached: 1,
      })
      .run();

    mergeGuestStatsIntoUser('guest-5', 'user-5');

    expect(getStats('guest-5')).toBeNull();
    expect(getStats('user-5')?.gamesWon).toBe(1);

    const result = db.select().from(gameResults).all()[0];
    expect(result?.userId).toBe('user-5');
  });

  it('does nothing when the guest has no stats to merge', () => {
    expect(() => mergeGuestStatsIntoUser('no-guest', 'user-6')).not.toThrow();
    expect(getStats('user-6')).toBeNull();
  });
});
