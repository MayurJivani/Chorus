import crypto from 'crypto';
import { eq, and, desc, asc, gt, lt, notExists, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistSessionResults,
  artistRoundGuesses,
} from '../db/schema';
import type { ArtistChallenge, ArtistChallengeTrack, ArtistSessionResult } from '../db/schema';
import { getArtistById, getFreshPreviewUrl, type ArtistTrack } from './deezerService';
import { getArtistCatalog } from './artistCatalogService';
import { seededShuffle } from '../utils/deterministic';
import { normalizeTitle } from '../utils/trackFilters';
import type { Identity } from '../auth/identity';
import { logger } from '../logger';

export const ARTIST_CHALLENGE_SIZE = 10;

export interface ArtistChallengeWithTracks {
  challenge: ArtistChallenge;
  tracks: ArtistChallengeTrack[];
}

export async function loadChallengeTracks(challengeId: number): Promise<ArtistChallengeTrack[]> {
  return db
    .select()
    .from(artistChallengeTracks)
    .where(eq(artistChallengeTracks.challengeId, challengeId))
    .orderBy(asc(artistChallengeTracks.position));
}

async function findChallenge(
  deezerArtistId: string,
  challengeDate: string,
  includeFeatures: boolean,
) {
  const rows = await db
    .select()
    .from(artistChallenges)
    .where(
      and(
        eq(artistChallenges.deezerArtistId, deezerArtistId),
        eq(artistChallenges.challengeDate, challengeDate),
        eq(artistChallenges.includeFeatures, includeFeatures),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getOrCreateArtistChallenge(
  artistId: number,
  challengeDate: string,
  includeFeatures = false,
): Promise<ArtistChallengeWithTracks> {
  const deezerArtistId = String(artistId);
  const existing = await findChallenge(deezerArtistId, challengeDate, includeFeatures);
  if (existing) {
    return { challenge: existing, tracks: await loadChallengeTracks(existing.id) };
  }

  const artist = await getArtistById(artistId);
  if (!artist) {
    throw new Error('Artist not found');
  }

  const topTracks = await getArtistCatalog(artistId, includeFeatures);
  if (topTracks.length < ARTIST_CHALLENGE_SIZE) {
    throw new Error(`Not enough playable tracks for ${artist.name} to build a challenge`);
  }

  const chosen = seededShuffle(
    topTracks,
    `${deezerArtistId}:${challengeDate}:${includeFeatures}`,
  ).slice(0, ARTIST_CHALLENGE_SIZE);

  let challenge: ArtistChallenge;
  try {
    const insertedRows = await db
      .insert(artistChallenges)
      .values({ deezerArtistId, artistName: artist.name, challengeDate, includeFeatures })
      .returning();
    const inserted = insertedRows[0];
    if (!inserted) throw new Error('Failed to create the artist challenge');
    challenge = inserted;
  } catch {
    // Lost a race with a concurrent request creating the same (artist, date, includeFeatures)
    // challenge — the row now exists, so just read it back instead of failing the request.
    const raced = await findChallenge(deezerArtistId, challengeDate, includeFeatures);
    if (!raced) throw new Error('Failed to create or find the artist challenge');
    return { challenge: raced, tracks: await loadChallengeTracks(raced.id) };
  }

  await db.insert(artistChallengeTracks).values(
    chosen.map((track, position) => ({
      challengeId: challenge.id,
      position,
      deezerTrackId: track.deezerTrackId,
      title: track.title,
      artist: track.artist,
      albumArtUrl: track.albumArtUrl,
      durationSeconds: track.durationSeconds,
    })),
  );

  return { challenge, tracks: await loadChallengeTracks(challenge.id) };
}

async function findSessionResult(challengeId: number, identity: Identity) {
  if (identity.userId) {
    const rows = await db
      .select()
      .from(artistSessionResults)
      .where(
        and(
          eq(artistSessionResults.challengeId, challengeId),
          eq(artistSessionResults.userId, identity.userId),
        ),
      )
      .limit(1);
    return rows[0];
  }
  const rows = await db
    .select()
    .from(artistSessionResults)
    .where(
      and(
        eq(artistSessionResults.challengeId, challengeId),
        eq(artistSessionResults.guestId, identity.guestId ?? ''),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getOrCreateSessionProgress(
  challengeId: number,
  identity: Identity,
): Promise<ArtistSessionResult> {
  const existing = await findSessionResult(challengeId, identity);
  if (existing) return existing;

  const rows = await db
    .insert(artistSessionResults)
    .values({
      challengeId,
      userId: identity.userId,
      guestId: identity.userId ? null : identity.guestId,
    })
    .returning();
  const session = rows[0];
  if (!session) throw new Error('Failed to create the artist session');
  return session;
}

export async function getActiveSession(
  artistId: number,
  includeFeatures: boolean,
  identity: Identity,
): Promise<{ session: ArtistSessionResult; challenge: ArtistChallenge } | null> {
  const deezerArtistId = String(artistId);
  const rows = await db
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
    .limit(1);

  return rows[0] ?? null;
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
    const sharedRows = await db
      .select()
      .from(artistChallenges)
      .where(eq(artistChallenges.id, sharedChallengeId))
      .limit(1);
    const sharedChallenge = sharedRows[0];
    if (!sharedChallenge) throw new Error('Shared challenge not found');
    const session = await getOrCreateSessionProgress(sharedChallenge.id, identity);
    const tracks = await loadChallengeTracks(sharedChallenge.id);
    return { session, challenge: sharedChallenge, tracks };
  }

  // If not explicitly requesting a new challenge, look for the most recent session (completed or not)
  if (!playAgain) {
    const existingRows = await db
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
      .limit(1);
    const existing = existingRows[0];

    if (existing) {
      const tracks = await loadChallengeTracks(existing.challenge.id);
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
  const session = await getOrCreateSessionProgress(challenge.id, identity);

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

export async function recordArtistRoundResult(
  sessionId: number,
  correct: boolean,
  guessesUsed: number,
  snippetStageSeconds: number,
): Promise<RoundResultUpdate> {
  const sessionRows = await db
    .select()
    .from(artistSessionResults)
    .where(eq(artistSessionResults.id, sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    throw new Error('Artist session not found');
  }

  const position = session.currentRound;

  await db.insert(artistRoundGuesses).values({
    sessionId,
    position,
    correct,
    snippetStageSeconds,
  });

  const isLastRound = session.currentRound >= ARTIST_CHALLENGE_SIZE - 1;
  const songsCorrect = session.songsCorrect + (correct ? 1 : 0);
  const totalGuessesUsed = session.totalGuessesUsed + guessesUsed;

  // Compute wall-clock time on completion: seconds from session creation to now.
  const timeTakenSeconds = isLastRound
    ? Math.round((Date.now() - session.createdAt.getTime()) / 1000)
    : null;

  await db
    .update(artistSessionResults)
    .set({
      songsCorrect,
      totalGuessesUsed,
      currentRound: isLastRound ? session.currentRound : session.currentRound + 1,
      completed: isLastRound,
      timeTakenSeconds: timeTakenSeconds ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(artistSessionResults.id, sessionId));

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

/** Abandoned challenges older than this are collected. Long enough that a shared link still
 *  works for a week even if nobody has opened it yet. */
export const ABANDONED_CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deletes challenges nobody ever played a round of. Returns how many were removed.
 *
 * Opening an artist always starts a fresh challenge — that is the point, so an abandoned
 * half-run is never resumed — but it also means every visit writes a challenge row plus ten
 * track rows plus a session row, including visits where the player immediately backs out.
 * Without this, browsing artists grows the database indefinitely for runs nobody played.
 *
 * Only challenges where *no* session got past round zero are eligible, so anything with real
 * play behind it (and therefore leaderboard standings) is kept regardless of age. The
 * cascading foreign keys clear the track and session rows.
 */
export async function evictAbandonedChallenges(
  ttlMs = ABANDONED_CHALLENGE_TTL_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - ttlMs);

  const removed = await db
    .delete(artistChallenges)
    .where(
      and(
        lt(artistChallenges.createdAt, cutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(artistSessionResults)
            .where(
              and(
                eq(artistSessionResults.challengeId, artistChallenges.id),
                or(
                  gt(artistSessionResults.currentRound, 0),
                  eq(artistSessionResults.completed, true),
                ),
              ),
            ),
        ),
      ),
    )
    .returning({ id: artistChallenges.id });

  if (removed.length > 0) {
    logger.info({ removed: removed.length, cutoff }, 'Evicted abandoned artist challenges');
  }
  return removed.length;
}

const CHALLENGE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Runs the abandoned-challenge sweep at startup and daily after. Unref'd so it never holds
 *  the process open during shutdown. */
export function startAbandonedChallengeEviction(): NodeJS.Timeout {
  const sweep = (): void => {
    void evictAbandonedChallenges().catch((err) =>
      logger.error({ err }, 'Abandoned challenge eviction failed'),
    );
  };

  sweep();
  const timer = setInterval(sweep, CHALLENGE_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

/** How many replacement candidates to try before giving up on a dead challenge slot. */
const SUBSTITUTION_ATTEMPTS = 5;

/**
 * Resolves a playable preview for a challenge round, repairing the challenge if the stored
 * track has gone dead.
 *
 * A track can pass catalog filtering (Deezer's album listing advertises a preview) and still
 * return no preview from the per-track endpoint — licensing and regional availability differ
 * between the two. That used to 503 the request, and because the dead track stays pinned at
 * its position, the challenge was bricked at that round forever: every retry hit the same
 * track. Here the slot is instead rewritten in place with another track from the artist's
 * catalog that isn't already in the challenge, so the player keeps a full ten rounds and the
 * fix persists for everyone else playing the same shared challenge.
 */
export async function resolvePlayableRound(
  track: ArtistChallengeTrack,
  artistId: number,
  includeFeatures: boolean,
  usedTrackIds: readonly string[],
): Promise<{ track: ArtistChallengeTrack; previewUrl: string } | null> {
  const direct = await getFreshPreviewUrl(track.deezerTrackId);
  if (direct) return { track, previewUrl: direct.previewUrl };

  logger.warn(
    { deezerTrackId: track.deezerTrackId, title: track.title },
    'Challenge track has no playable preview; substituting',
  );

  const pool = await getArtistCatalog(artistId, includeFeatures);
  const excluded = new Set(usedTrackIds);
  const candidates = shuffle(pool.filter((t) => !excluded.has(t.deezerTrackId)));

  for (const candidate of candidates.slice(0, SUBSTITUTION_ATTEMPTS)) {
    const fresh = await getFreshPreviewUrl(candidate.deezerTrackId);
    if (!fresh) continue;

    const updatedRows = await db
      .update(artistChallengeTracks)
      .set({
        deezerTrackId: candidate.deezerTrackId,
        title: candidate.title,
        artist: candidate.artist,
        albumArtUrl: candidate.albumArtUrl,
        durationSeconds: candidate.durationSeconds,
      })
      .where(eq(artistChallengeTracks.id, track.id))
      .returning();

    const updated = updatedRows[0];
    if (updated) return { track: updated, previewUrl: fresh.previewUrl };
  }

  return null;
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
export async function getArtistLeaderboard(
  artistId: number,
  identity: Identity,
  limit = 20,
): Promise<{
  entries: ArtistLeaderboardEntry[];
  myBest: {
    songsCorrect: number;
    totalGuessesUsed: number;
    timeTakenSeconds: number | null;
  } | null;
}> {
  const deezerArtistId = String(artistId);

  const rows = (await db.execute(sql`
    SELECT owner_key as "ownerKey", display_name as "displayName", songs_correct as "songsCorrect",
           total_guesses_used as "totalGuessesUsed", time_taken_seconds as "timeTakenSeconds"
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
      WHERE c.deezer_artist_id = ${deezerArtistId} AND r.completed = true
    )
    WHERE rn = 1
    ORDER BY "songsCorrect" DESC, "timeTakenSeconds" ASC NULLS LAST, "totalGuessesUsed" ASC
    LIMIT ${limit}
  `)) as unknown as LeaderboardRow[];

  const myKey = identity.userId ?? identity.guestId ?? '';
  const entries = buildLeaderboardEntries(rows, myKey);

  const myBestRows = await db
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
        identity.userId
          ? eq(artistSessionResults.userId, identity.userId)
          : eq(artistSessionResults.guestId, identity.guestId ?? ''),
      ),
    )
    .orderBy(desc(artistSessionResults.songsCorrect), asc(artistSessionResults.totalGuessesUsed))
    .limit(1);
  const myBestRow = myBestRows[0];

  return { entries, myBest: myBestRow ?? null };
}

/** Per-challenge leaderboard — everyone who played a specific shared challenge. */
export async function getChallengeLeaderboard(
  challengeId: number,
  identity: Identity,
  limit = 20,
): Promise<{ entries: ArtistLeaderboardEntry[] }> {
  const rows = (await db.execute(sql`
    SELECT
      COALESCE(r.user_id, r.guest_id) as "ownerKey",
      u.display_name as "displayName",
      r.songs_correct as "songsCorrect",
      r.total_guesses_used as "totalGuessesUsed",
      r.time_taken_seconds as "timeTakenSeconds"
    FROM artist_session_results r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.challenge_id = ${challengeId} AND r.completed = true
    ORDER BY "songsCorrect" DESC, "timeTakenSeconds" ASC NULLS LAST, "totalGuessesUsed" ASC
    LIMIT ${limit}
  `)) as unknown as LeaderboardRow[];

  const myKey = identity.userId ?? identity.guestId ?? '';
  return { entries: buildLeaderboardEntries(rows, myKey) };
}

export interface GuessDistributionBucket {
  snippetSeconds: number;
  label: string;
  allPlayers: number;
  myGuesses: number;
}

export async function getArtistGuessDistribution(
  artistId: number,
  identity: Identity,
): Promise<GuessDistributionBucket[]> {
  const deezerArtistId = String(artistId);

  // The `::int` casts are load-bearing. Postgres COUNT(*) is bigint, which postgres-js returns
  // as a *string* to avoid precision loss, and the row type assertion below cannot catch that.
  // The client then summed the buckets with `+`, concatenating instead of adding — the legend
  // read "All players (01800000)" and the average divided by that, showing "avg 0.0s".

  const allRows = (await db.execute(sql`
    SELECT g.snippet_stage_seconds as "snippetStageSeconds", COUNT(*)::int as count
    FROM artist_round_guesses g
    JOIN artist_session_results s ON s.id = g.session_id
    JOIN artist_challenges c ON c.id = s.challenge_id
    WHERE c.deezer_artist_id = ${deezerArtistId}
      AND s.completed = true
      AND g.correct = true
    GROUP BY g.snippet_stage_seconds
  `)) as unknown as { snippetStageSeconds: number; count: number }[];

  const myRows = (await db.execute(sql`
    SELECT g.snippet_stage_seconds as "snippetStageSeconds", COUNT(*)::int as count
    FROM artist_round_guesses g
    JOIN artist_session_results s ON s.id = g.session_id
    JOIN artist_challenges c ON c.id = s.challenge_id
    WHERE c.deezer_artist_id = ${deezerArtistId}
      AND s.completed = true
      AND g.correct = true
      AND COALESCE(s.user_id, s.guest_id) = ${identity.userId ?? identity.guestId ?? ''}
    GROUP BY g.snippet_stage_seconds
  `)) as unknown as { snippetStageSeconds: number; count: number }[];

  const allMap = new Map(allRows.map((r) => [r.snippetStageSeconds, r.count]));
  const myMap = new Map(myRows.map((r) => [r.snippetStageSeconds, r.count]));

  const stages = [1, 2, 4, 7, 11, 16];
  return stages.map((s) => ({
    snippetSeconds: s,
    label: `${s}s`,
    allPlayers: allMap.get(s) ?? 0,
    myGuesses: myMap.get(s) ?? 0,
  }));
}
