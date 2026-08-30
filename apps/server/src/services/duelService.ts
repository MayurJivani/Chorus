/**
 * Rated 1v1 duels.
 *
 * A duel is two accounts racing the same songs at the same time, in a room the matchmaker built
 * for them (see duelQueueService and createDuelRoom). Fairness comes from it being one room:
 * both sides hear the same clip at the same moment, so the result needs no reconciliation.
 *
 * This module is now only the *record* — writing the settled row and moving the ratings. The
 * game itself is an ordinary multiplayer room.
 *
 * Accounts only. A rating has to attach to something that persists and is attributable, and a
 * guest is a browser cookie: clearing it would erase a rating, and two guests are
 * indistinguishable.
 *
 * Rows written before this rework are asynchronous duels — they carry a `challengeId` and no
 * denormalised source, which is why the read path still tolerates both shapes.
 */
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { artistChallenges, artistSessionResults, duels, users } from '../db/schema';
import type { Duel } from '../db/schema';
import { applyElo, STARTING_RATING, type DuelRun } from './eloService';
import { logger } from '../logger';

export class DuelError extends Error {}

export interface DuelPlayerView {
  userId: string;
  displayName: string;
  rating: number;
  /** Null until they finish; a duel in progress deliberately does not leak a partial score. */
  result: DuelRun | null;
}

export interface DuelView {
  id: number;
  /** Null for a live duel, which never wrote a challenge row. */
  challengeId: number | null;
  status: 'open' | 'complete';
  label: string;
  sourceType: string;
  /** Deezer artist id or category slug, so the client can build the play URL. */
  sourceId: string;
  totalRounds: number;
  challenger: DuelPlayerView;
  opponent: DuelPlayerView | null;
  winnerId: string | null;
  ratingChange: { challenger: number; opponent: number } | null;
  /** True when the result came from someone walking out rather than being outscored. */
  forfeited: boolean;
  /** Final round scores. Null for the older asynchronous duels, which never recorded them. */
  scores: { challenger: number; opponent: number } | null;
}

async function loadUser(userId: string) {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      rating: users.rating,
      ratedDuels: users.ratedDuels,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** A player's completed run on a challenge, or null if they haven't finished it. */
async function completedRun(challengeId: number, userId: string): Promise<DuelRun | null> {
  const rows = await db
    .select({
      songsCorrect: artistSessionResults.songsCorrect,
      totalGuessesUsed: artistSessionResults.totalGuessesUsed,
      timeTakenSeconds: artistSessionResults.timeTakenSeconds,
    })
    .from(artistSessionResults)
    .where(
      and(
        eq(artistSessionResults.challengeId, challengeId),
        eq(artistSessionResults.userId, userId),
        eq(artistSessionResults.completed, true),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDuel(duelId: number): Promise<DuelView | null> {
  // Left join: a live duel has no challenge row to join to, and an inner join silently returned
  // nothing for exactly the duels this mode now creates.
  const rows = await db
    .select({ duel: duels, challenge: artistChallenges })
    .from(duels)
    .leftJoin(artistChallenges, eq(artistChallenges.id, duels.challengeId))
    .where(eq(duels.id, duelId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  return toView(row.duel, row.challenge);
}

async function toView(
  duel: Duel,
  challenge: {
    artistName: string;
    sourceType: string;
    deezerArtistId: string;
    totalRounds: number;
  } | null,
): Promise<DuelView> {
  const challenger = await loadUser(duel.challengerId);
  const opponent = duel.opponentId ? await loadUser(duel.opponentId) : null;

  const settled = duel.status === 'complete';

  return {
    id: duel.id,
    challengeId: duel.challengeId,
    status: settled ? 'complete' : 'open',
    // Denormalised columns first: they are the only source for a live duel, and for an older
    // asynchronous one they are null so the challenge still answers.
    label: duel.label ?? challenge?.artistName ?? 'Duel',
    sourceType: duel.sourceType ?? challenge?.sourceType ?? 'artist',
    sourceId: duel.sourceId ?? challenge?.deezerArtistId ?? '',
    totalRounds: challenge?.totalRounds ?? 0,
    forfeited: duel.forfeited,
    scores:
      duel.challengerScore != null && duel.opponentScore != null
        ? { challenger: duel.challengerScore, opponent: duel.opponentScore }
        : null,
    challenger: {
      userId: duel.challengerId,
      displayName: challenger?.displayName ?? 'Player',
      // The rating as it stood when the duel settled, so a finished duel keeps telling the same
      // story even after both players have moved on.
      rating: settled
        ? (duel.challengerRatingAfter ?? STARTING_RATING)
        : (challenger?.rating ?? STARTING_RATING),
      // Only asynchronous duels have a stored run to read back; a live duel's outcome is the
      // score on the row itself.
      result:
        duel.challengeId != null ? await completedRun(duel.challengeId, duel.challengerId) : null,
    },
    opponent: opponent
      ? {
          userId: opponent.id,
          displayName: opponent.displayName,
          rating: settled ? (duel.opponentRatingAfter ?? STARTING_RATING) : opponent.rating,
          result:
            duel.challengeId != null ? await completedRun(duel.challengeId, opponent.id) : null,
        }
      : null,
    winnerId: duel.winnerId,
    ratingChange:
      settled && duel.challengerRatingBefore != null && duel.opponentRatingBefore != null
        ? {
            challenger: (duel.challengerRatingAfter ?? 0) - duel.challengerRatingBefore,
            opponent: (duel.opponentRatingAfter ?? 0) - duel.opponentRatingBefore,
          }
        : null,
  };
}

export interface LiveDuelInput {
  challengerUserId: string;
  opponentUserId: string;
  challengerScore: number;
  opponentScore: number;
  sourceType: string;
  sourceId: string;
  label: string;
  forfeited: boolean;
}

/**
 * Records a finished live duel and moves both ratings.
 *
 * Unlike the asynchronous duels this replaced, there is no row to update: the match existed
 * only as an in-memory room, so the row is written once, already settled. The source is stored
 * on the row rather than reached through a challenge join, because a live duel never creates an
 * `artist_challenges` record to join to.
 */
export async function recordLiveDuel(input: LiveDuelInput): Promise<DuelView> {
  const [challenger, opponent] = await Promise.all([
    loadUser(input.challengerUserId),
    loadUser(input.opponentUserId),
  ]);
  if (!challenger || !opponent) throw new DuelError('Both players must have accounts');

  const outcome =
    input.challengerScore > input.opponentScore
      ? 1
      : input.challengerScore < input.opponentScore
        ? 0
        : 0.5;
  const change = applyElo(challenger, opponent, outcome);
  const winnerId = outcome === 1 ? challenger.id : outcome === 0 ? opponent.id : null;

  const duelId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(duels)
      .values({
        challengeId: null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        label: input.label,
        challengerId: challenger.id,
        opponentId: opponent.id,
        status: 'complete',
        settledAt: new Date(),
        winnerId,
        challengerScore: input.challengerScore,
        opponentScore: input.opponentScore,
        forfeited: input.forfeited,
        challengerRatingBefore: change.challenger.before,
        challengerRatingAfter: change.challenger.after,
        opponentRatingBefore: change.opponent.before,
        opponentRatingAfter: change.opponent.after,
      })
      .returning({ id: duels.id });

    await tx
      .update(users)
      .set({ rating: change.challenger.after, ratedDuels: challenger.ratedDuels + 1 })
      .where(eq(users.id, challenger.id));
    await tx
      .update(users)
      .set({ rating: change.opponent.after, ratedDuels: opponent.ratedDuels + 1 })
      .where(eq(users.id, opponent.id));

    return inserted[0]!.id;
  });

  logger.info(
    { duelId, winnerId, forfeited: input.forfeited, delta: change.challenger.delta },
    'Live duel settled',
  );
  return (await getDuel(duelId))!;
}

/** Duels a player is involved in, newest first. */
export async function listDuelsForUser(userId: string, limit = 20): Promise<DuelView[]> {
  const rows = await db
    .select({ duel: duels, challenge: artistChallenges })
    .from(duels)
    // Left, not inner: a live duel has no challenge row, and an inner join drops exactly the
    // duels this mode creates — which is every duel from here on.
    .leftJoin(artistChallenges, eq(artistChallenges.id, duels.challengeId))
    .where(or(eq(duels.challengerId, userId), eq(duels.opponentId, userId)))
    .orderBy(desc(duels.id))
    .limit(limit);

  return Promise.all(rows.map((r) => toView(r.duel, r.challenge)));
}

export interface RatingStanding {
  rank: number;
  displayName: string;
  rating: number;
  ratedDuels: number;
  isYou: boolean;
}

/**
 * The rating board.
 *
 * Players with no rated duels are left off entirely: everyone starts on the same number, so
 * listing them would fill the board with people who have never played a duel, all tied.
 */
export async function getRatingLeaderboard(
  userId: string | null,
  limit = 50,
): Promise<RatingStanding[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      rating: users.rating,
      ratedDuels: users.ratedDuels,
    })
    .from(users)
    .where(sql`${users.ratedDuels} > 0`)
    .orderBy(desc(users.rating), desc(users.ratedDuels))
    .limit(limit);

  return rows.map((row, index) => ({
    rank: index + 1,
    displayName: row.displayName,
    rating: row.rating,
    ratedDuels: row.ratedDuels,
    isYou: userId != null && row.id === userId,
  }));
}
