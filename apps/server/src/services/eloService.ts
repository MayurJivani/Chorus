/**
 * Elo rating maths, kept free of the database so it can be reasoned about and tested directly.
 *
 * Standard Elo: each player's expected result comes from the rating gap, and the update is K
 * times how far the actual result fell from that expectation. Beating someone far above you
 * moves you a lot; beating someone far below you barely moves you at all.
 */

/** Everyone starts here. The absolute number is arbitrary; only differences carry meaning. */
export const STARTING_RATING = 1200;

/**
 * How much a single result can move a rating.
 *
 * Higher for a player's first few duels so a new rating finds its level quickly instead of
 * crawling there over dozens of games, then settles down so an established rating isn't
 * whipped around by one bad round.
 */
export const PROVISIONAL_DUELS = 10;
const PROVISIONAL_K = 48;
const ESTABLISHED_K = 24;

export function kFactor(ratedDuels: number): number {
  return ratedDuels < PROVISIONAL_DUELS ? PROVISIONAL_K : ESTABLISHED_K;
}

/** The share of a win the rating gap says this player should expect, between 0 and 1. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/** 1 for a win, 0.5 for a draw, 0 for a loss. */
export type Outcome = 1 | 0.5 | 0;

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

/**
 * Both players' new ratings.
 *
 * Computed together from the *pre-duel* ratings on both sides. Updating one and then deriving
 * the other from the updated value would make the result depend on which player was processed
 * first, and the two deltas would no longer be symmetric.
 */
export function applyElo(
  challenger: { rating: number; ratedDuels: number },
  opponent: { rating: number; ratedDuels: number },
  challengerOutcome: Outcome,
): { challenger: RatingChange; opponent: RatingChange } {
  const challengerExpected = expectedScore(challenger.rating, opponent.rating);
  const opponentExpected = 1 - challengerExpected;
  const opponentOutcome = (1 - challengerOutcome) as Outcome;

  const change = (
    player: { rating: number; ratedDuels: number },
    expected: number,
    outcome: Outcome,
  ): RatingChange => {
    // Rounded, not floored: flooring would bleed a point away from every player over time.
    const after = Math.round(player.rating + kFactor(player.ratedDuels) * (outcome - expected));
    return { before: player.rating, after, delta: after - player.rating };
  };

  return {
    challenger: change(challenger, challengerExpected, challengerOutcome),
    opponent: change(opponent, opponentExpected, opponentOutcome),
  };
}

export interface DuelRun {
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
}

/**
 * Who won, by the same ordering the leaderboards use: more songs, then fewer guesses, then
 * faster. A genuine tie on all three is a draw rather than being broken arbitrarily.
 *
 * A missing time never loses on its own — an unrecorded clock is a gap in our data, not a slow
 * player, so it only ranks behind a recorded one when everything else is level.
 */
export function decideDuel(challenger: DuelRun, opponent: DuelRun): Outcome {
  if (challenger.songsCorrect !== opponent.songsCorrect) {
    return challenger.songsCorrect > opponent.songsCorrect ? 1 : 0;
  }
  if (challenger.totalGuessesUsed !== opponent.totalGuessesUsed) {
    return challenger.totalGuessesUsed < opponent.totalGuessesUsed ? 1 : 0;
  }

  const a = challenger.timeTakenSeconds;
  const b = opponent.timeTakenSeconds;
  if (a == null && b == null) return 0.5;
  if (a == null) return 0;
  if (b == null) return 1;
  if (a === b) return 0.5;
  return a < b ? 1 : 0;
}
