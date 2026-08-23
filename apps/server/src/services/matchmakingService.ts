import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { duels } from '../db/schema';
import { createDuel, acceptDuel, type DuelView } from './duelService';
import { resolveArtistSource } from './challengeSource';
import { logger } from '../logger';

const POPULAR_ARTISTS = [
  { id: 75798, name: 'Taylor Swift' },
  { id: 4050205, name: 'Bruno Mars' },
  { id: 246791, name: 'Ed Sheeran' },
  { id: 12246, name: 'Coldplay' },
  { id: 1562681, name: 'The Weeknd' },
  { id: 384236, name: 'Adele' },
  { id: 13, name: 'Eminem' },
  { id: 5575980, name: 'Billie Eilish' },
  { id: 4495513, name: 'Dua Lipa' },
  { id: 5080945, name: 'Post Malone' },
];

function pickRandomArtist() {
  return POPULAR_ARTISTS[Math.floor(Math.random() * POPULAR_ARTISTS.length)]!;
}

export async function findOrCreateMatch(userId: string): Promise<DuelView> {
  const waiting = await db
    .select({ duel: duels })
    .from(duels)
    .where(
      and(
        isNull(duels.opponentId),
        eq(duels.status, 'open'),
        sql`${duels.challengerId} <> ${userId}`,
        sql`${duels.createdAt} > NOW() - INTERVAL '10 minutes'`,
      ),
    )
    .orderBy(duels.createdAt)
    .limit(1);

  if (waiting[0]) {
    logger.info(
      { duelId: waiting[0].duel.id, matchedWith: userId },
      'Matchmaking: paired with existing duel',
    );
    return acceptDuel(waiting[0].duel.id, userId);
  }

  const artist = pickRandomArtist();
  const source = await resolveArtistSource(artist.id, false);
  const duel = await createDuel(source, userId);
  logger.info(
    { duelId: duel.id, artist: artist.name, userId },
    'Matchmaking: created new duel, waiting for opponent',
  );
  return duel;
}
