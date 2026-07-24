import crypto from 'crypto';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { artistChallenges, artistChallengeTracks, artistSessionResults } from '../db/schema';
import type { ArtistChallenge, ArtistChallengeTrack, ArtistSessionResult } from '../db/schema';
import { getArtistById, getArtistTopTracks, type ArtistTrack } from './deezerService';
import { seededShuffle } from '../utils/deterministic';
import { normalizeTitle } from '../utils/trackFilters';
import type { Identity } from '../auth/identity';

export const ARTIST_CHALLENGE_SIZE = 10;

export interface ArtistChallengeWithTracks {
  challenge: ArtistChallenge;
  tracks: ArtistChallengeTrack[];
}

export function loadChallengeTracks(challengeId: number): ArtistChallengeTrack[] {
  return db
    .select()
    .from(artistChallengeTracks)
    .where(eq(artistChallengeTracks.challengeId, challengeId))
    .orderBy(asc(artistChallengeTracks.position))
    .all();
}

function findChallenge(deezerArtistId: string, challengeDate: string, includeFeatures: boolean) {
  return db
    .select()
    .from(artistChallenges)
    .where(
      and(
        eq(artistChallenges.deezerArtistId, deezerArtistId),
        eq(artistChallenges.challengeDate, challengeDate),
        eq(artistChallenges.includeFeatures, includeFeatures),
      ),
    )
    .get();
}

export async function getOrCreateArtistChallenge(
  artistId: number,
  challengeDate: string,
  includeFeatures = false,
): Promise<ArtistChallengeWithTracks> {
  const deezerArtistId = String(artistId);
  const existing = findChallenge(deezerArtistId, challengeDate, includeFeatures);
  if (existing) {
    return { challenge: existing, tracks: loadChallengeTracks(existing.id) };
  }

  const artist = await getArtistById(artistId);
  if (!artist) {
    throw new Error('Artist not found');
  }

  const topTracks = await getArtistTopTracks(artistId, includeFeatures);
  if (topTracks.length < ARTIST_CHALLENGE_SIZE) {
    throw new Error(`Not enough playable tracks for ${artist.name} to build a challenge`);
  }

  const chosen = seededShuffle(
    topTracks,
    `${deezerArtistId}:${challengeDate}:${includeFeatures}`,
  ).slice(0, ARTIST_CHALLENGE_SIZE);

  let challenge: ArtistChallenge;
  try {
    challenge = db
      .insert(artistChallenges)
      .values({ deezerArtistId, artistName: artist.name, challengeDate, includeFeatures })
      .returning()
      .get();
  } catch {
    // Lost a race with a concurrent request creating the same (artist, date, includeFeatures)
    // challenge — the row now exists, so just read it back instead of failing the request.
    const raced = findChallenge(deezerArtistId, challengeDate, includeFeatures);
    if (!raced) throw new Error('Failed to create or find the artist challenge');
    return { challenge: raced, tracks: loadChallengeTracks(raced.id) };
  }

  db.insert(artistChallengeTracks)
    .values(
      chosen.map((track, position) => ({
        challengeId: challenge.id,
        position,
        deezerTrackId: track.deezerTrackId,
        title: track.title,
        artist: track.artist,
        albumArtUrl: track.albumArtUrl,
        durationSeconds: track.durationSeconds,
      })),
    )
    .run();

  return { challenge, tracks: loadChallengeTracks(challenge.id) };
}

function findSessionResult(challengeId: number, identity: Identity) {
  if (identity.userId) {
    return db
      .select()
      .from(artistSessionResults)
      .where(
        and(
          eq(artistSessionResults.challengeId, challengeId),
          eq(artistSessionResults.userId, identity.userId),
        ),
      )
      .get();
  }
  return db
    .select()
    .from(artistSessionResults)
    .where(
      and(
        eq(artistSessionResults.challengeId, challengeId),
        eq(artistSessionResults.guestId, identity.guestId ?? ''),
      ),
    )
    .get();
}

export function getOrCreateSessionProgress(
  challengeId: number,
  identity: Identity,
): ArtistSessionResult {
  const existing = findSessionResult(challengeId, identity);
  if (existing) return existing;

  return db
    .insert(artistSessionResults)
    .values({
      challengeId,
      userId: identity.userId,
      guestId: identity.userId ? null : identity.guestId,
    })
    .returning()
    .get();
}

export function getActiveSession(
  artistId: number,
  includeFeatures: boolean,
  identity: Identity,
): { session: ArtistSessionResult; challenge: ArtistChallenge } | null {
  const deezerArtistId = String(artistId);
  const active = db
    .select({
      session: artistSessionResults,
      challenge: artistChallenges,
    })
    .from(artistSessionResults)
    .innerJoin(artistChallenges, eq(artistChallenges.id, artistSessionResults.challengeId))
    .where(
      and(
        eq(artistChallenges.deezerArtistId, deezerArtistId),
        eq(artistChallenges.includeFeatures, includeFeatures),
        eq(artistSessionResults.completed, false),
        identity.userId
          ? eq(artistSessionResults.userId, identity.userId)
          : eq(artistSessionResults.guestId, identity.guestId ?? ''),
      ),
    )
    .orderBy(desc(artistSessionResults.id))
    .limit(1)
    .get();

  return active ?? null;
}

export interface ActiveSessionWithChallengeAndTracks {
  session: ArtistSessionResult;
  challenge: ArtistChallenge;
  tracks: ArtistChallengeTrack[];
}

export async function getActiveSessionOrStartNew(
  artistId: number,
  includeFeatures: boolean,
  identity: Identity,
  playAgain = false,
  /** If set, load this specific challenge (shared link flow) rather than the player's most recent one. */
  sharedChallengeId?: number,
): Promise<ActiveSessionWithChallengeAndTracks> {
  // Shared-link flow: load a specific challenge by ID, create a fresh session for this player if needed.
  if (sharedChallengeId != null && !playAgain) {
    const sharedChallenge = db
      .select()
      .from(artistChallenges)
      .where(eq(artistChallenges.id, sharedChallengeId))
      .get();
    if (!sharedChallenge) throw new Error('Shared challenge not found');
    const session = getOrCreateSessionProgress(sharedChallenge.id, identity);
    const tracks = loadChallengeTracks(sharedChallenge.id);
    return { session, challenge: sharedChallenge, tracks };
  }

  // If not explicitly requesting a new challenge, look for the most recent session (completed or not)
  if (!playAgain) {
    const existing = db
      .select({
        session: artistSessionResults,
        challenge: artistChallenges,
      })
      .from(artistSessionResults)
      .innerJoin(artistChallenges, eq(artistChallenges.id, artistSessionResults.challengeId))
      .where(
        and(
          eq(artistChallenges.deezerArtistId, String(artistId)),
          eq(artistChallenges.includeFeatures, includeFeatures),
          identity.userId
            ? eq(artistSessionResults.userId, identity.userId)
            : eq(artistSessionResults.guestId, identity.guestId ?? ''),
        ),
      )
      .orderBy(desc(artistSessionResults.id))
      .limit(1)
      .get();

    if (existing) {
      const tracks = loadChallengeTracks(existing.challenge.id);
      return {
        session: existing.session,
        challenge: existing.challenge,
        tracks,
      };
    }
  }

  // Generate a unique challengeDate using Date + randomUUID so it's a completely new, randomized challenge every time.
  const challengeDate = `${new Date().toISOString().split('T')[0]}_${crypto.randomUUID()}`;
  const { challenge, tracks } = await getOrCreateArtistChallenge(
    artistId,
    challengeDate,
    includeFeatures,
  );
  const session = getOrCreateSessionProgress(challenge.id, identity);

  return {
    session,
    challenge,
    tracks,
  };
}

export interface RoundResultUpdate {
  sessionComplete: boolean;
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
}

export function recordArtistRoundResult(
  sessionId: number,
  correct: boolean,
  guessesUsed: number,
): RoundResultUpdate {
  const session = db
    .select()
    .from(artistSessionResults)
    .where(eq(artistSessionResults.id, sessionId))
    .get();
  if (!session) {
    throw new Error('Artist session not found');
  }

  const isLastRound = session.currentRound >= ARTIST_CHALLENGE_SIZE - 1;
  const songsCorrect = session.songsCorrect + (correct ? 1 : 0);
  const totalGuessesUsed = session.totalGuessesUsed + guessesUsed;
  const now = new Date().toISOString();

  // Compute wall-clock time on completion: seconds from session creation to now.
  const timeTakenSeconds = isLastRound
    ? Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000)
    : null;

  db.update(artistSessionResults)
    .set({
      songsCorrect,
      totalGuessesUsed,
      currentRound: isLastRound ? session.currentRound : session.currentRound + 1,
      completed: isLastRound,
      timeTakenSeconds: timeTakenSeconds ?? undefined,
      updatedAt: now,
    })
    .where(eq(artistSessionResults.id, sessionId))
    .run();

  return { sessionComplete: isLastRound, songsCorrect, totalGuessesUsed, timeTakenSeconds };
}

/** Random (non-deterministic) shuffle — used for multiple-choice option ordering/decoy pick,
 * where unlike track *selection for the challenge* there's no need for repeatable output. */
function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

export interface RoundOption {
  deezerTrackId: string;
  title: string;
  artist: string;
}

/**
 * Three shuffled multiple-choice options for a round: the correct track plus two decoys drawn
 * from the wider candidate pool (the artist's full top-tracks list), not just the other 9
 * tracks in today's challenge. Two things this fixes: (1) decoys are deduplicated by
 * normalized title against the correct answer, so a near-duplicate version (e.g. two entries
 * that normalize to the same title) can never silently replace the "correct" button with a
 * second copy of itself; (2) drawing from a larger pool means decoys don't always come from
 * the same fixed 10 songs, which was giving away information across rounds.
 */
export function buildRoundOptions(
  correct: { deezerTrackId: string; title: string; artist: string },
  candidatePool: readonly ArtistTrack[],
): RoundOption[] {
  const correctNormalized = normalizeTitle(correct.title);
  const seen = new Set<string>([correctNormalized]);

  const decoyCandidates = candidatePool.filter((t) => {
    if (t.deezerTrackId === correct.deezerTrackId) return false;
    const normalized = normalizeTitle(t.title);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const decoys = shuffle(decoyCandidates)
    .slice(0, 2)
    .map((t) => ({ deezerTrackId: t.deezerTrackId, title: t.title, artist: t.artist }));

  return shuffle([
    { deezerTrackId: correct.deezerTrackId, title: correct.title, artist: correct.artist },
    ...decoys,
  ]);
}

export interface ArtistLeaderboardEntry {
  rank: number;
  displayName: string;
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
  isYou: boolean;
}

interface LeaderboardRow {
  ownerKey: string;
  displayName: string | null;
  songsCorrect: number;
  totalGuessesUsed: number;
  timeTakenSeconds: number | null;
}

function buildLeaderboardEntries(rows: LeaderboardRow[], myKey: string): ArtistLeaderboardEntry[] {
  return rows.map((row, index) => ({
    rank: index + 1,
    displayName: row.displayName ?? 'Guest',
    songsCorrect: row.songsCorrect,
    totalGuessesUsed: row.totalGuessesUsed,
    timeTakenSeconds: row.timeTakenSeconds,
    isYou: row.ownerKey === myKey,
  }));
}

/** Global per-artist leaderboard — best run per player across all challenges for this artist. */
export function getArtistLeaderboard(
  artistId: number,
  identity: Identity,
  limit = 20,
): {
  entries: ArtistLeaderboardEntry[];
  myBest: {
    songsCorrect: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
  } | null;
} {
  const deezerArtistId = String(artistId);

  const rows = db.all<LeaderboardRow>(sql`
    SELECT owner_key as ownerKey, display_name as displayName, songs_correct as songsCorrect,
           total_guesses_used as totalGuessesUsed, time_taken_seconds as timeTakenSeconds
    FROM (
      SELECT
        COALESCE(r.user_id, r.guest_id) as owner_key,
        u.display_name,
        r.songs_correct,
        r.total_guesses_used,
        r.time_taken_seconds,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(r.user_id, r.guest_id)
          ORDER BY r.songs_correct DESC, r.time_taken_seconds ASC NULLS LAST, r.total_guesses_used ASC
        ) as rn
      FROM artist_session_results r
      JOIN artist_challenges c ON c.id = r.challenge_id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE c.deezer_artist_id = ${deezerArtistId} AND r.completed = 1
    )
    WHERE rn = 1
    ORDER BY songsCorrect DESC, timeTakenSeconds ASC NULLS LAST, totalGuessesUsed ASC
    LIMIT ${limit}
  `);

  const myKey = identity.userId ?? identity.guestId ?? '';
  const entries = buildLeaderboardEntries(rows, myKey);

  const myBestRow = identity.userId
    ? db
        .select({
          songsCorrect: artistSessionResults.songsCorrect,
          totalGuessesUsed: artistSessionResults.totalGuessesUsed,
          timeTakenSeconds: artistSessionResults.timeTakenSeconds,
        })
        .from(artistSessionResults)
        .innerJoin(artistChallenges, eq(artistChallenges.id, artistSessionResults.challengeId))
        .where(
          and(
            eq(artistChallenges.deezerArtistId, deezerArtistId),
            eq(artistSessionResults.completed, true),
            eq(artistSessionResults.userId, identity.userId),
          ),
        )
        .orderBy(
          desc(artistSessionResults.songsCorrect),
          asc(artistSessionResults.totalGuessesUsed),
        )
        .limit(1)
        .all()[0]
    : db
        .select({
          songsCorrect: artistSessionResults.songsCorrect,
          totalGuessesUsed: artistSessionResults.totalGuessesUsed,
          timeTakenSeconds: artistSessionResults.timeTakenSeconds,
        })
        .from(artistSessionResults)
        .innerJoin(artistChallenges, eq(artistChallenges.id, artistSessionResults.challengeId))
        .where(
          and(
            eq(artistChallenges.deezerArtistId, deezerArtistId),
            eq(artistSessionResults.completed, true),
            eq(artistSessionResults.guestId, identity.guestId ?? ''),
          ),
        )
        .orderBy(
          desc(artistSessionResults.songsCorrect),
          asc(artistSessionResults.totalGuessesUsed),
        )
        .limit(1)
        .all()[0];

  return { entries, myBest: myBestRow ?? null };
}

/** Per-challenge leaderboard — everyone who played a specific shared challenge. */
export function getChallengeLeaderboard(
  challengeId: number,
  identity: Identity,
  limit = 20,
): { entries: ArtistLeaderboardEntry[] } {
  const rows = db.all<LeaderboardRow>(sql`
    SELECT
      COALESCE(r.user_id, r.guest_id) as ownerKey,
      u.display_name as displayName,
      r.songs_correct as songsCorrect,
      r.total_guesses_used as totalGuessesUsed,
      r.time_taken_seconds as timeTakenSeconds
    FROM artist_session_results r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.challenge_id = ${challengeId} AND r.completed = 1
    ORDER BY songsCorrect DESC, timeTakenSeconds ASC NULLS LAST, totalGuessesUsed ASC
    LIMIT ${limit}
  `);

  const myKey = identity.userId ?? identity.guestId ?? '';
  return { entries: buildLeaderboardEntries(rows, myKey) };
}
