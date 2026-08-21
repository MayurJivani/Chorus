import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../apps/server/src/db/client';
import {
  artistChallenges,
  artistChallengeTracks,
  artistRoundGuesses,
  artistSessionResults,
  dailyPuzzles,
  gameResults,
  sessions,
  songs,
  users,
  userStats,
} from '../apps/server/src/db/schema';

interface SongRow {
  id: number;
  title: string;
  artist: string;
  deezer_track_id: string;
  preview_url: string;
  album_art_url: string | null;
  duration_seconds: number;
  verified_at: string;
  active: number;
  created_at: string;
}

interface DailyPuzzleRow {
  id: number;
  puzzle_date: string;
  song_id: number;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
}

interface SessionRow {
  id: string;
  user_id: string | null;
  guest_id: string;
  expires_at: string;
  created_at: string;
}

interface UserStatsRow {
  owner_key: string;
  current_streak: number;
  max_streak: number;
  games_played: number;
  games_won: number;
  guess_dist_1: number;
  guess_dist_2: number;
  guess_dist_3: number;
  guess_dist_4: number;
  guess_dist_5: number;
  guess_dist_6: number;
  last_played_date: string | null;
  updated_at: string;
}

interface GameResultRow {
  id: number;
  user_id: string | null;
  guest_id: string | null;
  puzzle_id: number;
  won: number;
  guesses_used: number;
  snippet_stage_reached: number;
  created_at: string;
}

interface ArtistChallengeRow {
  id: number;
  deezer_artist_id: string;
  artist_name: string;
  challenge_date: string;
  include_features: number;
  created_at: string;
}

interface ArtistChallengeTrackRow {
  challenge_id: number;
  position: number;
  deezer_track_id: string;
  title: string;
  artist: string;
  album_art_url: string | null;
  duration_seconds: number;
}

interface ArtistSessionResultRow {
  id: number;
  challenge_id: number;
  user_id: string | null;
  guest_id: string | null;
  current_round: number;
  songs_correct: number;
  total_guesses_used: number;
  completed: number;
  time_taken_seconds: number | null;
  created_at: string;
  updated_at: string;
}

interface ArtistRoundGuessRow {
  session_id: number;
  position: number;
  correct: number;
  snippet_stage_seconds: number;
  created_at: string;
}

const DEFAULT_SQLITE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/server/data/chorusify.db',
);

function toDate(value: string | null): Date | null {
  if (value == null) return null;
  // SQLite stores naive timestamps like "2026-08-04 10:21:40" (UTC) and ISO strings
  // like "2026-09-03T10:21:47.535Z". Normalize both to an ISO string postgres-js accepts.
  const iso = value.replace(' ', 'T');
  const parsed = new Date(iso.includes('Z') ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toBool(value: number | boolean): boolean {
  return value === 1 || value === true;
}

interface Counts {
  [table: string]: number;
}

async function main(): Promise<void> {
  const sqlitePath = process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH;
  const sqlite = new Database(sqlitePath, { readonly: true });
  const counts: Counts = {};

  try {
    const songRows = sqlite.prepare('SELECT * FROM songs').all() as unknown as SongRow[];
    const songIdMap = new Map<number, number>();
    for (const row of songRows) {
      const inserted = await db
        .insert(songs)
        .values({
          title: row.title,
          artist: row.artist,
          deezerTrackId: row.deezer_track_id,
          previewUrl: row.preview_url,
          albumArtUrl: row.album_art_url ?? null,
          durationSeconds: row.duration_seconds,
          verifiedAt: toDate(row.verified_at) ?? new Date(),
          active: toBool(row.active),
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: songs.id });
      const newId = inserted[0]?.id;
      if (newId) {
        songIdMap.set(row.id, newId);
        counts.songs = (counts.songs ?? 0) + 1;
      }
    }

    const songByTrackId = new Map(
      (await db.select({ id: songs.id, deezerTrackId: songs.deezerTrackId }).from(songs)).map(
        (s) => [s.deezerTrackId, s.id] as const,
      ),
    );

    for (const row of sqlite
      .prepare('SELECT * FROM daily_puzzles')
      .all() as unknown as DailyPuzzleRow[]) {
      const songRow = sqlite
        .prepare('SELECT deezer_track_id FROM songs WHERE id = ?')
        .get(row.song_id) as { deezer_track_id: string } | undefined;
      const newSongId = songRow ? songByTrackId.get(songRow.deezer_track_id) : undefined;
      if (!newSongId) continue;
      const inserted = await db
        .insert(dailyPuzzles)
        .values({
          puzzleDate: row.puzzle_date,
          songId: newSongId,
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: dailyPuzzles.id });
      if (inserted[0]) {
        counts.dailyPuzzles = (counts.dailyPuzzles ?? 0) + 1;
      }
    }

    for (const row of sqlite.prepare('SELECT * FROM users').all() as unknown as UserRow[]) {
      await db
        .insert(users)
        .values({
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          displayName: row.display_name,
          createdAt: toDate(row.created_at) ?? new Date(),
          lastLoginAt: toDate(row.last_login_at),
        })
        .onConflictDoNothing();
      counts.users = (counts.users ?? 0) + 1;
    }

    const existingUserIds = new Set(
      (await db.select({ id: users.id }).from(users)).map((u) => u.id),
    );
    for (const row of sqlite.prepare('SELECT * FROM sessions').all() as unknown as SessionRow[]) {
      if (row.user_id && !existingUserIds.has(row.user_id)) continue;
      const inserted = await db
        .insert(sessions)
        .values({
          id: row.id,
          userId: row.user_id,
          guestId: row.guest_id,
          expiresAt: toDate(row.expires_at) ?? new Date(),
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: sessions.id });
      if (inserted[0]) {
        counts.sessions = (counts.sessions ?? 0) + 1;
      }
    }

    for (const row of sqlite
      .prepare('SELECT * FROM user_stats')
      .all() as unknown as UserStatsRow[]) {
      await db
        .insert(userStats)
        .values({
          ownerKey: row.owner_key,
          currentStreak: row.current_streak,
          maxStreak: row.max_streak,
          gamesPlayed: row.games_played,
          gamesWon: row.games_won,
          guessDist1: row.guess_dist_1,
          guessDist2: row.guess_dist_2,
          guessDist3: row.guess_dist_3,
          guessDist4: row.guess_dist_4,
          guessDist5: row.guess_dist_5,
          guessDist6: row.guess_dist_6,
          lastPlayedDate: row.last_played_date,
          updatedAt: toDate(row.updated_at) ?? new Date(),
        })
        .onConflictDoNothing();
      counts.userStats = (counts.userStats ?? 0) + 1;
    }

    const puzzleIdByDate = new Map(
      (
        await db
          .select({ id: dailyPuzzles.id, puzzleDate: dailyPuzzles.puzzleDate })
          .from(dailyPuzzles)
      ).map((p) => [p.puzzleDate, p.id] as const),
    );
    for (const row of sqlite
      .prepare('SELECT * FROM game_results')
      .all() as unknown as GameResultRow[]) {
      const puzzleRow = sqlite
        .prepare('SELECT puzzle_date FROM daily_puzzles WHERE id = ?')
        .get(row.puzzle_id) as { puzzle_date: string } | undefined;
      const puzzleId = puzzleRow ? puzzleIdByDate.get(puzzleRow.puzzle_date) : undefined;
      if (!puzzleId) continue;
      await db
        .insert(gameResults)
        .values({
          userId: row.user_id,
          guestId: row.guest_id,
          puzzleId,
          won: toBool(row.won),
          guessesUsed: row.guesses_used,
          snippetStageReached: row.snippet_stage_reached,
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing();
      counts.gameResults = (counts.gameResults ?? 0) + 1;
    }

    // Artist challenge tables are empty in the existing SQLite database, but map them anyway
    // so the script stays correct if the source db ever grows before the switchover.
    const challengeIdMap = new Map<number, number>();
    for (const row of sqlite
      .prepare('SELECT * FROM artist_challenges')
      .all() as unknown as ArtistChallengeRow[]) {
      const inserted = await db
        .insert(artistChallenges)
        .values({
          deezerArtistId: row.deezer_artist_id,
          artistName: row.artist_name,
          challengeDate: row.challenge_date,
          includeFeatures: toBool(row.include_features),
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: artistChallenges.id });
      const newId = inserted[0]?.id;
      if (newId) {
        challengeIdMap.set(row.id, newId);
        counts.artistChallenges = (counts.artistChallenges ?? 0) + 1;
      }
    }

    for (const row of sqlite
      .prepare('SELECT * FROM artist_challenge_tracks')
      .all() as unknown as ArtistChallengeTrackRow[]) {
      const challengeId = challengeIdMap.get(row.challenge_id);
      if (!challengeId) continue;
      await db
        .insert(artistChallengeTracks)
        .values({
          challengeId,
          position: row.position,
          deezerTrackId: row.deezer_track_id,
          title: row.title,
          artist: row.artist,
          albumArtUrl: row.album_art_url ?? null,
          durationSeconds: row.duration_seconds,
        })
        .onConflictDoNothing();
      counts.artistChallengeTracks = (counts.artistChallengeTracks ?? 0) + 1;
    }

    const sessionIdMap = new Map<number, number>();
    for (const row of sqlite
      .prepare('SELECT * FROM artist_session_results')
      .all() as unknown as ArtistSessionResultRow[]) {
      const challengeId = challengeIdMap.get(row.challenge_id);
      if (!challengeId) continue;
      const inserted = await db
        .insert(artistSessionResults)
        .values({
          challengeId,
          userId: row.user_id,
          guestId: row.guest_id,
          currentRound: row.current_round,
          songsCorrect: row.songs_correct,
          totalGuessesUsed: row.total_guesses_used,
          completed: toBool(row.completed),
          timeTakenSeconds: row.time_taken_seconds,
          createdAt: toDate(row.created_at) ?? new Date(),
          updatedAt: toDate(row.updated_at) ?? new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: artistSessionResults.id });
      const newId = inserted[0]?.id;
      if (newId) {
        sessionIdMap.set(row.id, newId);
        counts.artistSessionResults = (counts.artistSessionResults ?? 0) + 1;
      }
    }

    for (const row of sqlite
      .prepare('SELECT * FROM artist_round_guesses')
      .all() as unknown as ArtistRoundGuessRow[]) {
      const sessionId = sessionIdMap.get(row.session_id);
      if (!sessionId) continue;
      await db
        .insert(artistRoundGuesses)
        .values({
          sessionId,
          position: row.position,
          correct: toBool(row.correct),
          snippetStageSeconds: row.snippet_stage_seconds,
          createdAt: toDate(row.created_at) ?? new Date(),
        })
        .onConflictDoNothing();
      counts.artistRoundGuesses = (counts.artistRoundGuesses ?? 0) + 1;
    }

    console.log('Migration complete. Inserted rows:');
    for (const [table, n] of Object.entries(counts)) {
      console.log(`  ${table}: ${n}`);
    }
  } finally {
    sqlite.close();
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void (async () => {
      const { sqlClient } = await import('../apps/server/src/db/client');
      await sqlClient.end().catch(() => undefined);
      process.exit(process.exitCode ?? 0);
    })();
  });
