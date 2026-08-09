/**
 * Cross-artist leaderboards.
 *
 * Only registered users appear. Guests are deliberately excluded rather than shown as
 * "Guest": a guest identity is a browser cookie, so guest rows are neither stable (clearing
 * cookies loses them) nor attributable (every guest renders identically), which makes a
 * ranking of them meaningless. Signing up is what puts a player on the board.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import type { Identity } from '../auth/identity';

export interface GlobalLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  /** Completed artist runs. */
  runs: number;
  songsCorrect: number;
  songsPossible: number;
  accuracy: number;
  bestRun: number;
  averageTimeSeconds: number | null;
  fastestRunSeconds: number | null;
  isYou: boolean;
}

export interface MostPlayedArtist {
  deezerArtistId: string;
  artistName: string;
  runs: number;
  players: number;
  averageScore: number;
}

interface GlobalRow {
  userId: string;
  displayName: string | null;
  runs: number;
  songsCorrect: number;
  songsPossible: number;
  bestRun: number;
  avgTime: string | null;
  fastestRun: number | null;
}

const ARTIST_CHALLENGE_SIZE = 10;

/**
 * Overall standings, ranked by total songs guessed correctly across completed runs.
 *
 * Total rather than average, so the board rewards playing as well as scoring — an average
 * would let one lucky 10/10 outrank someone with fifty strong runs, and would swing wildly on
 * a player's first game. Ties break toward the player who needed fewer guesses, then the
 * faster one, matching how a single artist's board already orders its entries.
 */
export async function getGlobalLeaderboard(
  identity: Identity,
  limit = 50,
): Promise<GlobalLeaderboardEntry[]> {
  const rows = (await db.execute(sql`
    SELECT
      u.id                                            AS "userId",
      u.display_name                                  AS "displayName",
      COUNT(*)::int                                   AS "runs",
      COALESCE(SUM(r.songs_correct), 0)::int          AS "songsCorrect",
      (COUNT(*) * ${ARTIST_CHALLENGE_SIZE})::int      AS "songsPossible",
      COALESCE(MAX(r.songs_correct), 0)::int          AS "bestRun",
      AVG(r.time_taken_seconds)                       AS "avgTime",
      MIN(r.time_taken_seconds)::int                  AS "fastestRun"
    FROM artist_session_results r
    JOIN users u ON u.id = r.user_id
    WHERE r.completed = true AND r.user_id IS NOT NULL
    GROUP BY u.id, u.display_name
    ORDER BY
      "songsCorrect" DESC,
      COALESCE(SUM(r.total_guesses_used), 0) ASC,
      AVG(r.time_taken_seconds) ASC NULLS LAST
    LIMIT ${limit}
  `)) as unknown as GlobalRow[];

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    displayName: row.displayName ?? 'Player',
    runs: row.runs,
    songsCorrect: row.songsCorrect,
    songsPossible: row.songsPossible,
    accuracy: row.songsPossible > 0 ? Math.round((row.songsCorrect / row.songsPossible) * 100) : 0,
    bestRun: row.bestRun,
    // AVG returns numeric, which postgres-js hands back as a string — parse rather than trust
    // the row type, which is only an assertion.
    averageTimeSeconds: row.avgTime == null ? null : Math.round(Number(row.avgTime)),
    fastestRunSeconds: row.fastestRun,
    isYou: identity.userId != null && row.userId === identity.userId,
  }));
}

/**
 * The artists people actually play, by completed runs.
 *
 * Counted across everyone including guests — this measures what the game is used for, not who
 * is winning, and excluding guests would badly understate it since most play is anonymous.
 */
export async function getMostPlayedArtists(limit = 10): Promise<MostPlayedArtist[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.deezer_artist_id                                        AS "deezerArtistId",
      MAX(c.artist_name)                                        AS "artistName",
      COUNT(*)::int                                             AS "runs",
      COUNT(DISTINCT COALESCE(r.user_id, r.guest_id))::int      AS "players",
      AVG(r.songs_correct)                                      AS "avgScore"
    FROM artist_session_results r
    JOIN artist_challenges c ON c.id = r.challenge_id
    WHERE r.completed = true
    GROUP BY c.deezer_artist_id
    ORDER BY "runs" DESC, "players" DESC
    LIMIT ${limit}
  `)) as unknown as {
    deezerArtistId: string;
    artistName: string;
    runs: number;
    players: number;
    avgScore: string | null;
  }[];

  return rows.map((row) => ({
    deezerArtistId: row.deezerArtistId,
    artistName: row.artistName,
    runs: row.runs,
    players: row.players,
    averageScore: row.avgScore == null ? 0 : Math.round(Number(row.avgScore) * 10) / 10,
  }));
}
