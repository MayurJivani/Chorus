import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  duelRatings,
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
import {
  getRatingLeaderboard,
  listDuelsForUser,
  recordLiveDuel,
  type LiveDuelInput,
} from '../../src/services/duelService';
import { STARTING_RATING } from '../../src/services/eloService';

async function seedUser(id: string, displayName: string, rating = STARTING_RATING) {
  await db
    .insert(users)
    .values({ id, email: `${id}@example.test`, passwordHash: 'x', displayName, rating });
}

function liveDuel(over: Partial<LiveDuelInput> = {}): LiveDuelInput {
  return {
    challengerUserId: 'u1',
    opponentUserId: 'u2',
    challengerScore: 30,
    opponentScore: 10,
    sourceType: 'artist',
    sourceId: '412',
    label: 'Queen',
    forfeited: false,
    mode: 'artist',
    ...over,
  };
}

/** Ratings live per mode now, so a lookup has to name one. */
async function ratingOf(userId: string, mode = 'artist'): Promise<number> {
  const rows = await db
    .select({ rating: duelRatings.rating })
    .from(duelRatings)
    .where(and(eq(duelRatings.userId, userId), eq(duelRatings.mode, mode)));
  return rows[0]?.rating ?? STARTING_RATING;
}

beforeEach(async () => {
  await clearArtistPools();
  await db.delete(duelRatings);
  await db.delete(duels);
  await db.delete(artistSessionResults);
  await db.delete(artistChallengeTracks);
  await db.delete(artistChallenges);
  await db.delete(users);
  await seedUser('u1', 'Ada');
  await seedUser('u2', 'Blake');
});

describe('recordLiveDuel', () => {
  it('writes a settled duel with the source on the row, not a challenge join', async () => {
    const view = await recordLiveDuel(liveDuel());

    expect(view).toMatchObject({
      status: 'complete',
      label: 'Queen',
      sourceType: 'artist',
      sourceId: '412',
      winnerId: 'u1',
      forfeited: false,
      scores: { challenger: 30, opponent: 10 },
    });
    // A live duel never creates an artist_challenges row, so there is nothing to point at.
    expect(view.challengeId).toBeNull();
  });

  it('moves both ratings in opposite directions by the same amount', async () => {
    const view = await recordLiveDuel(liveDuel());

    const [a, b] = [await ratingOf('u1'), await ratingOf('u2')];
    expect(a).toBeGreaterThan(STARTING_RATING);
    expect(b).toBeLessThan(STARTING_RATING);
    expect(a - STARTING_RATING).toBe(STARTING_RATING - b);
    expect(view.ratingChange!.challenger).toBe(-view.ratingChange!.opponent);
  });

  it('counts the duel against both players, so K-factor can settle down', async () => {
    await recordLiveDuel(liveDuel());
    const rows = await db.select({ ratedDuels: duelRatings.ratedDuels }).from(duelRatings);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ratedDuels === 1)).toBe(true);
  });

  it('records a draw on equal scores without moving either rating', async () => {
    const view = await recordLiveDuel(liveDuel({ challengerScore: 20, opponentScore: 20 }));

    expect(view.winnerId).toBeNull();
    expect(await ratingOf('u1')).toBe(STARTING_RATING);
    expect(await ratingOf('u2')).toBe(STARTING_RATING);
  });

  it('lets the lower score win when it belongs to the opponent', async () => {
    const view = await recordLiveDuel(liveDuel({ challengerScore: 5, opponentScore: 40 }));
    expect(view.winnerId).toBe('u2');
    expect(await ratingOf('u2')).toBeGreaterThan(STARTING_RATING);
  });

  /* Forfeits are what stop the rating being a record only of games people chose to let finish. */
  it('applies a normal rating change to a forfeit, and flags it', async () => {
    const view = await recordLiveDuel(
      liveDuel({ challengerScore: 1, opponentScore: 0, forfeited: true }),
    );

    expect(view.forfeited).toBe(true);
    expect(view.winnerId).toBe('u1');
    expect(await ratingOf('u1')).toBeGreaterThan(STARTING_RATING);
    expect(await ratingOf('u2')).toBeLessThan(STARTING_RATING);
  });

  it('refuses to rate a duel where a player no longer exists', async () => {
    await expect(recordLiveDuel(liveDuel({ opponentUserId: 'ghost' }))).rejects.toThrow();
  });

  it('shows up in both players history', async () => {
    await recordLiveDuel(liveDuel());
    expect(await listDuelsForUser('u1')).toHaveLength(1);
    expect(await listDuelsForUser('u2')).toHaveLength(1);
  });

  /* Ratings are per mode: the same account can be strong at chosen artists and ordinary at
     "surprise me", and one averaged number described neither. */
  it('keeps each mode on its own ladder', async () => {
    await recordLiveDuel(liveDuel({ mode: 'artist' }));
    await recordLiveDuel(liveDuel({ mode: 'category', challengerScore: 0, opponentScore: 50 }));

    // u1 won the artist duel and lost the category one.
    expect(await ratingOf('u1', 'artist')).toBeGreaterThan(STARTING_RATING);
    expect(await ratingOf('u1', 'category')).toBeLessThan(STARTING_RATING);
    // A mode nobody has played is still level.
    expect(await ratingOf('u1', 'random')).toBe(STARTING_RATING);
  });

  it('records which ladder a duel counted towards', async () => {
    const view = await recordLiveDuel(liveDuel({ mode: 'random' }));
    const rows = await db.select({ mode: duels.mode }).from(duels).where(eq(duels.id, view.id));
    expect(rows[0]!.mode).toBe('random');
  });
});

describe('getRatingLeaderboard', () => {
  it('leaves out players who have never finished a rated duel', async () => {
    const board = await getRatingLeaderboard('u1', 'artist');
    expect(board).toHaveLength(0);
  });

  it('ranks by rating once duels have been played', async () => {
    await recordLiveDuel(liveDuel());

    const board = await getRatingLeaderboard('u1', 'artist');
    expect(board.map((e) => e.displayName)).toEqual(['Ada', 'Blake']);
    expect(board[0]).toMatchObject({ rank: 1, isYou: true, ratedDuels: 1 });
  });
});
