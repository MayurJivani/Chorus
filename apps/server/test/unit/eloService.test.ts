import { describe, it, expect } from 'vitest';
import {
  applyElo,
  decideDuel,
  expectedScore,
  kFactor,
  PROVISIONAL_DUELS,
  STARTING_RATING,
} from '../../src/services/eloService';

const established = (rating: number) => ({ rating, ratedDuels: PROVISIONAL_DUELS + 5 });

describe('expectedScore', () => {
  it('is an even split between equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 6);
  });

  it('favours the higher rating, and the two expectations always sum to one', () => {
    const strong = expectedScore(1600, 1200);
    const weak = expectedScore(1200, 1600);

    expect(strong).toBeGreaterThan(0.9);
    expect(strong + weak).toBeCloseTo(1, 6);
  });

  it('treats a 400-point gap as the textbook 10:1 odds', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 4);
  });
});

describe('kFactor', () => {
  it('moves a new rating faster than an established one', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(PROVISIONAL_DUELS));
    expect(kFactor(PROVISIONAL_DUELS - 1)).toBeGreaterThan(kFactor(PROVISIONAL_DUELS));
  });

  it('stops changing once a player is established', () => {
    expect(kFactor(PROVISIONAL_DUELS)).toBe(kFactor(100));
  });
});

describe('applyElo', () => {
  it('moves equal players by the same amount in opposite directions', () => {
    const { challenger, opponent } = applyElo(established(1200), established(1200), 1);

    expect(challenger.delta).toBeGreaterThan(0);
    expect(opponent.delta).toBe(-challenger.delta);
  });

  it('rewards beating someone stronger more than beating someone weaker', () => {
    const upset = applyElo(established(1200), established(1600), 1);
    const expected = applyElo(established(1600), established(1200), 1);

    expect(upset.challenger.delta).toBeGreaterThan(expected.challenger.delta);
  });

  it('barely moves a heavy favourite who wins', () => {
    const { challenger } = applyElo(established(1800), established(1000), 1);
    expect(challenger.delta).toBeLessThanOrEqual(2);
  });

  it('punishes a heavy favourite who loses', () => {
    const { challenger } = applyElo(established(1800), established(1000), 0);
    expect(challenger.delta).toBeLessThan(-20);
  });

  it('leaves equal players unchanged on a draw', () => {
    const { challenger, opponent } = applyElo(established(1400), established(1400), 0.5);

    expect(challenger.delta).toBe(0);
    expect(opponent.delta).toBe(0);
  });

  it('still shifts a lopsided draw toward the underdog', () => {
    const { challenger, opponent } = applyElo(established(1000), established(1600), 0.5);

    expect(challenger.delta).toBeGreaterThan(0);
    expect(opponent.delta).toBeLessThan(0);
  });

  /**
   * Both deltas come from the *pre-duel* ratings. Deriving the second from the already-updated
   * first would make the result depend on processing order and quietly stop being symmetric.
   */
  it('is symmetric regardless of which side is called the challenger', () => {
    const asChallenger = applyElo(established(1350), established(1500), 1);
    const asOpponent = applyElo(established(1500), established(1350), 0);

    expect(asChallenger.challenger.delta).toBe(asOpponent.opponent.delta);
    expect(asChallenger.opponent.delta).toBe(asOpponent.challenger.delta);
  });

  it('is zero-sum between two established players', () => {
    for (const outcome of [1, 0.5, 0] as const) {
      const { challenger, opponent } = applyElo(established(1240), established(1310), outcome);
      expect(challenger.delta + opponent.delta).toBe(0);
    }
  });

  it('returns whole ratings, since a fractional rating is not a thing we store', () => {
    const { challenger, opponent } = applyElo(established(1207), established(1333), 1);
    expect(Number.isInteger(challenger.after)).toBe(true);
    expect(Number.isInteger(opponent.after)).toBe(true);
  });
});

describe('decideDuel', () => {
  const run = (
    songsCorrect: number,
    totalGuessesUsed = 10,
    timeTakenSeconds: number | null = 60,
  ) => ({
    songsCorrect,
    totalGuessesUsed,
    timeTakenSeconds,
  });

  it('ranks more songs first', () => {
    expect(decideDuel(run(8), run(6))).toBe(1);
    expect(decideDuel(run(6), run(8))).toBe(0);
  });

  it('breaks a tied score on fewer guesses', () => {
    expect(decideDuel(run(8, 10), run(8, 14))).toBe(1);
    expect(decideDuel(run(8, 14), run(8, 10))).toBe(0);
  });

  it('breaks a tied score and guess count on time', () => {
    expect(decideDuel(run(8, 10, 45), run(8, 10, 60))).toBe(1);
    expect(decideDuel(run(8, 10, 90), run(8, 10, 60))).toBe(0);
  });

  it('calls a genuine tie a draw rather than picking arbitrarily', () => {
    expect(decideDuel(run(8, 10, 60), run(8, 10, 60))).toBe(0.5);
  });

  /** A missing clock is a gap in our data, not evidence the player was slow. */
  it('only ranks a missing time behind a recorded one when nothing else separates them', () => {
    expect(decideDuel(run(8, 10, null), run(8, 10, 60))).toBe(0);
    expect(decideDuel(run(9, 10, null), run(8, 10, 60))).toBe(1);
    expect(decideDuel(run(8, 10, null), run(8, 10, null))).toBe(0.5);
  });
});

describe('STARTING_RATING', () => {
  it('is the conventional 1200', () => {
    expect(STARTING_RATING).toBe(1200);
  });
});
