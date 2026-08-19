import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  duels,
  users,
} from '../../src/db/schema';

vi.mock('../../src/services/deezerService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/deezerService')>();
  return {
    ...actual,
    getArtistById: vi.fn().mockResolvedValue({ id: 412, name: 'Queen', pictureUrl: null }),
    getArtistTopTracks: vi.fn().mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        deezerTrackId: `d-${i}`,
        title: `Track ${i}`,
        artist: 'Queen',
        albumArtUrl: null,
        durationSeconds: 200,
      })),
    ),
    getFreshPreviewUrl: vi.fn().mockResolvedValue({ previewUrl: 'x', durationSeconds: 200 }),
  };
});

import { clearArtistPools } from '../../src/services/artistCatalogService';
import { resolveArtistSource } from '../../src/services/challengeSource';
import {
  acceptDuel,
  createDuel,
  DuelError,
  getDuel,
  getRatingLeaderboard,
  listOpenDuels,
  settleDuelsForChallenge,
} from '../../src/services/duelService';
import { STARTING_RATING } from '../../src/services/eloService';

async function seedUser(id: string, displayName: string, rating = STARTING_RATING) {
  await db
    .insert(users)
    .values({ id, email: `${id}@example.test`, passwordHash: 'x', displayName, rating });
}

/** Records a finished run for a player on a challenge, without playing it round by round. */
async function finishRun(
  challengeId: number,
  userId: string,
  opts: { songsCorrect: number; totalGuessesUsed: number; timeTakenSeconds: number | null },
) {
  await db.insert(artistSessionResults).values({
    challengeId,
    userId,
    completed: true,
    currentRound: 9,
    ...opts,
  });
}

beforeEach(async () => {
  await clearArtistPools();
  await db.delete(duels);
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
  await db.delete(users);
});

async function newDuel(challengerId: string) {
  return createDuel(await resolveArtistSource(412, false), challengerId);
}

describe('createDuel', () => {
  it('builds a challenge and opens the duel for someone to take', async () => {
    await seedUser('u1', 'Ada');
    const duel = await newDuel('u1');

    expect(duel.status).toBe('open');
    expect(duel.opponent).toBeNull();
    expect(duel.challenger).toMatchObject({ displayName: 'Ada', rating: STARTING_RATING });
    expect(duel.totalRounds).toBeGreaterThan(0);
  });

  it('gives each duel its own challenge, so neither side has seen the songs', async () => {
    await seedUser('u1', 'Ada');
    const first = await newDuel('u1');
    const second = await newDuel('u1');

    expect(second.challengeId).not.toBe(first.challengeId);
  });
});

describe('acceptDuel', () => {
  it('refuses the challenger their own duel', async () => {
    await seedUser('u1', 'Ada');
    const duel = await newDuel('u1');

    // A rating you can farm by playing yourself is not a rating.
    await expect(acceptDuel(duel.id, 'u1')).rejects.toBeInstanceOf(DuelError);
  });

  it('refuses a third player once someone has taken it', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    await seedUser('u3', 'Linus');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    await expect(acceptDuel(duel.id, 'u3')).rejects.toBeInstanceOf(DuelError);
  });

  it('is idempotent for the player who already took it', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    const again = await acceptDuel(duel.id, 'u2');
    expect(again.opponent?.userId).toBe('u2');
  });
});

describe('settleDuelsForChallenge', () => {
  it('does nothing until both players have finished', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    await finishRun(duel.challengeId, 'u1', {
      songsCorrect: 8,
      totalGuessesUsed: 12,
      timeTakenSeconds: 60,
    });

    expect(await settleDuelsForChallenge(duel.challengeId)).toBeNull();
    expect((await getDuel(duel.id))?.status).toBe('open');
  });

  it('settles once both have played, moving both ratings', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    await finishRun(duel.challengeId, 'u1', {
      songsCorrect: 9,
      totalGuessesUsed: 11,
      timeTakenSeconds: 60,
    });
    await finishRun(duel.challengeId, 'u2', {
      songsCorrect: 6,
      totalGuessesUsed: 18,
      timeTakenSeconds: 80,
    });

    const settled = await settleDuelsForChallenge(duel.challengeId);

    expect(settled?.status).toBe('complete');
    expect(settled?.winnerId).toBe('u1');
    expect(settled?.ratingChange?.challenger).toBeGreaterThan(0);
    expect(settled?.ratingChange?.opponent).toBeLessThan(0);

    const [ada] = await db.select().from(users).where(eq(users.id, 'u1'));
    expect(ada?.rating).toBeGreaterThan(STARTING_RATING);
    expect(ada?.ratedDuels).toBe(1);
  });

  it('records a draw without moving equal ratings', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    const identical = { songsCorrect: 7, totalGuessesUsed: 13, timeTakenSeconds: 55 };
    await finishRun(duel.challengeId, 'u1', identical);
    await finishRun(duel.challengeId, 'u2', identical);

    const settled = await settleDuelsForChallenge(duel.challengeId);

    expect(settled?.winnerId).toBeNull();
    expect(settled?.status).toBe('complete');
    expect(settled?.ratingChange).toEqual({ challenger: 0, opponent: 0 });
  });

  /**
   * Both players can finish within a moment of each other, and settlement runs on each. Applying
   * the rating change twice would double every result.
   */
  it('settles exactly once even if called again', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    await finishRun(duel.challengeId, 'u1', {
      songsCorrect: 9,
      totalGuessesUsed: 10,
      timeTakenSeconds: 50,
    });
    await finishRun(duel.challengeId, 'u2', {
      songsCorrect: 5,
      totalGuessesUsed: 20,
      timeTakenSeconds: 90,
    });

    await settleDuelsForChallenge(duel.challengeId);
    const afterFirst = (await db.select().from(users).where(eq(users.id, 'u1')))[0];

    await settleDuelsForChallenge(duel.challengeId);
    const afterSecond = (await db.select().from(users).where(eq(users.id, 'u1')))[0];

    expect(afterSecond?.rating).toBe(afterFirst?.rating);
    expect(afterSecond?.ratedDuels).toBe(1);
  });

  it('leaves an unaccepted duel alone even if the challenger finishes', async () => {
    await seedUser('u1', 'Ada');
    const duel = await newDuel('u1');
    await finishRun(duel.challengeId, 'u1', {
      songsCorrect: 10,
      totalGuessesUsed: 10,
      timeTakenSeconds: 40,
    });

    expect(await settleDuelsForChallenge(duel.challengeId)).toBeNull();
  });
});

describe('listOpenDuels', () => {
  it('hides a player their own open duels', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    await newDuel('u1');

    expect(await listOpenDuels('u1')).toHaveLength(0);
    expect(await listOpenDuels('u2')).toHaveLength(1);
  });

  it('drops a duel once it has been taken', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    await seedUser('u3', 'Linus');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');

    expect(await listOpenDuels('u3')).toHaveLength(0);
  });
});

describe('getRatingLeaderboard', () => {
  it('leaves out players who have never finished a rated duel', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');

    // Everyone starts on the same rating, so listing them would be a board of ties.
    expect(await getRatingLeaderboard('u1')).toHaveLength(0);
  });

  it('ranks by rating once duels have been played', async () => {
    await seedUser('u1', 'Ada');
    await seedUser('u2', 'Grace');
    const duel = await newDuel('u1');
    await acceptDuel(duel.id, 'u2');
    await finishRun(duel.challengeId, 'u1', {
      songsCorrect: 9,
      totalGuessesUsed: 10,
      timeTakenSeconds: 50,
    });
    await finishRun(duel.challengeId, 'u2', {
      songsCorrect: 4,
      totalGuessesUsed: 20,
      timeTakenSeconds: 95,
    });
    await settleDuelsForChallenge(duel.challengeId);

    const board = await getRatingLeaderboard('u2');

    expect(board.map((e) => e.displayName)).toEqual(['Ada', 'Grace']);
    expect(board[0]!.rating).toBeGreaterThan(board[1]!.rating);
    expect(board[1]!.isYou).toBe(true);
  });
});
