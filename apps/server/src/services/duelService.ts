/**
 * Rated 1v1 duels.
 *
 * A duel is one shared challenge played by two accounts. That is the whole trick: the fairness
 * comes from both players answering the same ten songs, so nothing new is needed to *run* one —
 * they each play the challenge exactly as they would a shared link, and settlement reads the
 * results the normal game already wrote.
 *
 * Accounts only. A rating has to attach to something that persists and is attributable, and a
 * guest is a browser cookie: clearing it would erase a rating, and two guests are
 * indistinguishable.
 */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { artistChallenges, artistSessionResults, duels, users } from '../db/schema';
import type { Duel } from '../db/schema';
import { applyElo, decideDuel, STARTING_RATING, type DuelRun } from './eloService';
import { getOrCreateChallenge } from './artistChallengeService';
import type { ChallengeSource } from './challengeSource';
import { logger } from '../logger';
import crypto from 'crypto';

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
  challengeId: number;
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

/**
 * Creates a duel and the challenge behind it.
 *
 * The challenge gets a unique date suffix so it is a fresh set of songs rather than one the
 * challenger might already have seen — a duel over a challenge one side has played is not a
 * duel.
 */
export async function createDuel(source: ChallengeSource, challengerId: string): Promise<DuelView> {
  const challengeDate = `duel-${new Date().toISOString().slice(0, 10)}_${crypto.randomUUID()}`;
  const { challenge } = await getOrCreateChallenge(source, challengeDate);

  const inserted = await db
    .insert(duels)
    .values({ challengeId: challenge.id, challengerId })
    .returning();
  const duel = inserted[0];
  if (!duel) throw new DuelError('Could not create the duel');

  logger.info({ duelId: duel.id, challengeId: challenge.id, challengerId }, 'Duel created');
  return (await getDuel(duel.id))!;
}

/**
 * Joins an open duel.
 *
 * Refuses the challenger's own duel: a rating you can farm by playing yourself is not a rating.
 */
export async function acceptDuel(duelId: number, opponentId: string): Promise<DuelView> {
  const rows = await db.select().from(duels).where(eq(duels.id, duelId)).limit(1);
  const duel = rows[0];
  if (!duel) throw new DuelError('Duel not found');
  if (duel.challengerId === opponentId) {
    throw new DuelError('You cannot accept your own duel');
  }
  if (duel.opponentId && duel.opponentId !== opponentId) {
    throw new DuelError('Someone has already taken this duel');
  }

  if (!duel.opponentId) {
    await db.update(duels).set({ opponentId }).where(eq(duels.id, duelId));
  }
  return (await getDuel(duelId))!;
}

export async function getDuel(duelId: number): Promise<DuelView | null> {
  const rows = await db
    .select({ duel: duels, challenge: artistChallenges })
    .from(duels)
    .innerJoin(artistChallenges, eq(artistChallenges.id, duels.challengeId))
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
  },
): Promise<DuelView> {
  const challenger = await loadUser(duel.challengerId);
  const opponent = duel.opponentId ? await loadUser(duel.opponentId) : null;

  const settled = duel.status === 'complete';

  return {
    id: duel.id,
    challengeId: duel.challengeId,
    status: settled ? 'complete' : 'open',
    label: challenge.artistName,
    sourceType: challenge.sourceType,
    sourceId: challenge.deezerArtistId,
    totalRounds: challenge.totalRounds,
    challenger: {
      userId: duel.challengerId,
      displayName: challenger?.displayName ?? 'Player',
      // The rating as it stood when the duel settled, so a finished duel keeps telling the same
      // story even after both players have moved on.
      rating: settled
        ? (duel.challengerRatingAfter ?? STARTING_RATING)
        : (challenger?.rating ?? STARTING_RATING),
      result: await completedRun(duel.challengeId, duel.challengerId),
    },
    opponent: opponent
      ? {
          userId: opponent.id,
          displayName: opponent.displayName,
          rating: settled ? (duel.opponentRatingAfter ?? STARTING_RATING) : opponent.rating,
          result: await completedRun(duel.challengeId, opponent.id),
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

/**
 * Settles any duel on this challenge whose players have both finished.
 *
 * Called after a run completes rather than on a schedule, so the result lands while the player
 * is still looking at it. Doing nothing when only one side has played is the normal case: an
 * async duel spends most of its life half-finished.
 */
export async function settleDuelsForChallenge(challengeId: number): Promise<DuelView | null> {
  const rows = await db
    .select()
    .from(duels)
    .where(and(eq(duels.challengeId, challengeId), eq(duels.status, 'open')))
    .limit(1);
  const duel = rows[0];
  if (!duel?.opponentId) return null;

  const [challengerRun, opponentRun] = await Promise.all([
    completedRun(challengeId, duel.challengerId),
    completedRun(challengeId, duel.opponentId),
  ]);
  if (!challengerRun || !opponentRun) return null;

  const [challenger, opponent] = await Promise.all([
    loadUser(duel.challengerId),
    loadUser(duel.opponentId),
  ]);
  if (!challenger || !opponent) return null;

  const outcome = decideDuel(challengerRun, opponentRun);
  const change = applyElo(challenger, opponent, outcome);
  const winnerId = outcome === 1 ? challenger.id : outcome === 0 ? opponent.id : null;

  await db.transaction(async (tx) => {
    // Guarded on `status = 'open'` so two runs finishing at once cannot both settle the duel and
    // apply the rating change twice.
    const claimed = await tx
      .update(duels)
      .set({
        status: 'complete',
        settledAt: new Date(),
        winnerId,
        challengerRatingBefore: change.challenger.before,
        challengerRatingAfter: change.challenger.after,
        opponentRatingBefore: change.opponent.before,
        opponentRatingAfter: change.opponent.after,
      })
      .where(and(eq(duels.id, duel.id), eq(duels.status, 'open')))
      .returning({ id: duels.id });

    if (claimed.length === 0) return;

    await tx
      .update(users)
      .set({ rating: change.challenger.after, ratedDuels: challenger.ratedDuels + 1 })
      .where(eq(users.id, challenger.id));
    await tx
      .update(users)
      .set({ rating: change.opponent.after, ratedDuels: opponent.ratedDuels + 1 })
      .where(eq(users.id, opponent.id));
  });

  logger.info(
    { duelId: duel.id, winnerId, challengerDelta: change.challenger.delta },
    'Duel settled',
  );
  return getDuel(duel.id);
}

/** Duels a player is involved in, newest first. */
export async function listDuelsForUser(userId: string, limit = 20): Promise<DuelView[]> {
  const rows = await db
    .select({ duel: duels, challenge: artistChallenges })
    .from(duels)
    .innerJoin(artistChallenges, eq(artistChallenges.id, duels.challengeId))
    .where(or(eq(duels.challengerId, userId), eq(duels.opponentId, userId)))
    .orderBy(desc(duels.id))
    .limit(limit);

  return Promise.all(rows.map((r) => toView(r.duel, r.challenge)));
}

/** Open duels nobody has taken yet, excluding the player's own. */
export async function listOpenDuels(userId: string, limit = 20): Promise<DuelView[]> {
  const rows = await db
    .select({ duel: duels, challenge: artistChallenges })
    .from(duels)
    .innerJoin(artistChallenges, eq(artistChallenges.id, duels.challengeId))
    .where(
      and(
        isNull(duels.opponentId),
        eq(duels.status, 'open'),
        sql`${duels.challengerId} <> ${userId}`,
      ),
    )
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
