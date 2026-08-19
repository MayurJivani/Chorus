import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const songs = pgTable('songs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  deezerTrackId: text('deezer_track_id').notNull().unique(),
  previewUrl: text('preview_url').notNull(),
  albumArtUrl: text('album_art_url'),
  durationSeconds: integer('duration_seconds').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  active: boolean('active').notNull().default(true),
  manualOverride: boolean('manual_override').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dailyPuzzles = pgTable(
  'daily_puzzles',
  {
    id: serial('id').primaryKey(),
    puzzleDate: text('puzzle_date').notNull().unique(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('daily_puzzles_date_idx').on(table.puzzleDate)],
);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  // Grants access to the admin tools (editing the daily puzzle schedule). Off by default and
  // only ever set directly in the database — there is deliberately no route that grants it,
  // so a bug in the admin API can never escalate someone into an admin.
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // SHA-256 hash of the opaque token held in the cookie
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guestId: text('guest_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameResults = pgTable(
  'game_results',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    guestId: text('guest_id'),
    puzzleId: integer('puzzle_id')
      .notNull()
      .references(() => dailyPuzzles.id),
    won: boolean('won').notNull(),
    guessesUsed: integer('guesses_used').notNull(),
    snippetStageReached: integer('snippet_stage_reached').notNull(),
    // Wall-clock seconds from first opening the puzzle to finishing it. Null for results
    // recorded before timing existed, and for anyone whose start was never captured.
    timeTakenSeconds: integer('time_taken_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('game_results_user_puzzle_idx').on(table.userId, table.puzzleId),
    uniqueIndex('game_results_guest_puzzle_idx').on(table.guestId, table.puzzleId),
  ],
);

/**
 * When each player first opened a given daily puzzle.
 *
 * Solve time has to be measured from something the server saw. Taking an elapsed figure from
 * the client would make the headline "fastest solve" stat trivially forgeable, and there is
 * nowhere else to read a start from — a `game_results` row only exists once the puzzle is
 * already over. One row per player per puzzle, written on first view and never updated, so
 * reloading the page cannot restart the clock.
 */
export const dailyPuzzleStarts = pgTable(
  'daily_puzzle_starts',
  {
    id: serial('id').primaryKey(),
    ownerKey: text('owner_key').notNull(), // user_id if present, else guest_id
    puzzleId: integer('puzzle_id')
      .notNull()
      .references(() => dailyPuzzles.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('daily_puzzle_starts_owner_puzzle_idx').on(table.ownerKey, table.puzzleId),
  ],
);

export const artistRoundGuesses = pgTable(
  'artist_round_guesses',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => artistSessionResults.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    correct: boolean('correct').notNull(),
    snippetStageSeconds: integer('snippet_stage_seconds').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('artist_round_guesses_session_position_idx').on(table.sessionId, table.position),
  ],
);

export const userStats = pgTable('user_stats', {
  ownerKey: text('owner_key').primaryKey(), // user_id if present, else guest_id
  currentStreak: integer('current_streak').notNull().default(0),
  maxStreak: integer('max_streak').notNull().default(0),
  gamesPlayed: integer('games_played').notNull().default(0),
  gamesWon: integer('games_won').notNull().default(0),
  guessDist1: integer('guess_dist_1').notNull().default(0),
  guessDist2: integer('guess_dist_2').notNull().default(0),
  guessDist3: integer('guess_dist_3').notNull().default(0),
  guessDist4: integer('guess_dist_4').notNull().default(0),
  guessDist5: integer('guess_dist_5').notNull().default(0),
  guessDist6: integer('guess_dist_6').notNull().default(0),
  lastPlayedDate: text('last_played_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const artistChallenges = pgTable(
  'artist_challenges',
  {
    id: serial('id').primaryKey(),
    // Holds a Deezer artist id for an artist run, or a category slug for a category run —
    // which of the two is decided by `sourceType`, never by parsing this value.
    deezerArtistId: text('deezer_artist_id').notNull(),
    artistName: text('artist_name').notNull(),
    challengeDate: text('challenge_date').notNull(), // UTC 'YYYY-MM-DD' (+ optional UUID suffix for randomized challenges)
    // Category runs reuse this table because the game itself is identical — ten rounds, the
    // same guesses, the same sessions. They are tagged rather than split out so none of that
    // machinery has to be duplicated, and so the artist leaderboard can exclude them: guessing
    // ten songs from Top Hits 1985 is a different skill from an artist's deep cuts.
    sourceType: text('source_type').notNull().default('artist'),
    // How many rounds this challenge was built with, fixed at creation. The run length is an
    // admin setting, and reading the *current* setting to decide when a run ends would break
    // every challenge already in flight the moment it changed — a 10-track challenge would
    // wait forever for round 20. The tracks are the source of truth; this records their count.
    totalRounds: integer('total_rounds').notNull().default(10),
    // Part of the challenge's identity, not just a display preference: including
    // featured/collaboration tracks changes which songs are eligible, so "with features" and
    // "without" are two distinct (still each shared/deterministic) daily challenges.
    includeFeatures: boolean('include_features').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('artist_challenges_artist_date_features_idx').on(
      table.deezerArtistId,
      table.challengeDate,
      table.includeFeatures,
    ),
  ],
);

/**
 * Runtime-tunable settings, edited from the admin dashboard.
 *
 * One row per setting rather than a single blob so two admins editing different settings can't
 * clobber each other, and so a row that fails validation (after a schema change, say) only
 * costs that one setting its stored value — `settingsService` falls back to the compiled-in
 * default per key. Absent rows mean "still at the default", which is why nothing is seeded.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const artistChallengeTracks = pgTable(
  'artist_challenge_tracks',
  {
    id: serial('id').primaryKey(),
    challengeId: integer('challenge_id')
      .notNull()
      .references(() => artistChallenges.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // 0-9
    deezerTrackId: text('deezer_track_id').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    albumArtUrl: text('album_art_url'),
    durationSeconds: integer('duration_seconds').notNull(),
  },
  (table) => [
    uniqueIndex('artist_challenge_tracks_challenge_position_idx').on(
      table.challengeId,
      table.position,
    ),
  ],
);

/**
 * Persistent cache of an artist's playable catalog, so Artist Mode doesn't re-crawl Deezer.
 *
 * Building one pool costs a request per album (~126 for Taylor Swift, ~7s), and the in-memory
 * cache dies with the process — every deploy or restart made the next player pay full price
 * again. Rows are keyed by (artist, includeFeatures) because the feature filter is applied
 * during the crawl and changes which tracks survive deduplication.
 *
 * `lastAccessedAt` drives retention: pools nobody has opened for 30 days are evicted, so the
 * table stays proportional to the artists people actually play rather than every artist ever
 * searched. `fetchedAt` drives refresh — a stale pool is still served immediately and renewed
 * in the background.
 */
export const artistTrackPools = pgTable(
  'artist_track_pools',
  {
    id: serial('id').primaryKey(),
    deezerArtistId: text('deezer_artist_id').notNull(),
    includeFeatures: boolean('include_features').notNull().default(false),
    artistName: text('artist_name').notNull(),
    artistPictureUrl: text('artist_picture_url'),
    // ArtistTrack[] — read and written whole, never queried field-by-field.
    tracks: jsonb('tracks').notNull().$type<ArtistTrackPoolEntry[]>(),
    trackCount: integer('track_count').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('artist_track_pools_artist_features_idx').on(
      table.deezerArtistId,
      table.includeFeatures,
    ),
    index('artist_track_pools_last_accessed_idx').on(table.lastAccessedAt),
  ],
);

export interface ArtistTrackPoolEntry {
  deezerTrackId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  durationSeconds: number;
}

/**
 * A Survival run: endless rounds, one wrong answer ends it.
 *
 * Kept apart from `artist_session_results` rather than folded into it, because the two disagree
 * about what a run *is*. A challenge has a fixed set of tracks decided up front and a known
 * length; a survival run has neither — tracks are drawn one at a time until the player misses,
 * so the pending track and the tracks already used have to live on the run itself.
 *
 * `endedAt` doubles as the completion flag: null means in progress, which is also what makes
 * "resume the run I was in" a single lookup.
 */
export const survivalRuns = pgTable(
  'survival_runs',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    guestId: text('guest_id'),
    guessMode: text('guess_mode').notNull().default('search'),
    /** Consecutive correct answers so far — the score, and what the board ranks. */
    streak: integer('streak').notNull().default(0),
    /** Deezer ids already served in this run, so a run never repeats a song. */
    usedTrackIds: jsonb('used_track_ids').notNull().$type<string[]>().default([]),
    // The track currently in play, stored server-side so a guess is checked against what the
    // server served rather than anything the client reports back.
    currentTrackId: text('current_track_id'),
    currentTitle: text('current_title'),
    currentArtist: text('current_artist'),
    currentAlbumArtUrl: text('current_album_art_url'),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('survival_runs_user_idx').on(table.userId),
    index('survival_runs_guest_idx').on(table.guestId),
    index('survival_runs_streak_idx').on(table.streak),
  ],
);

export const artistSessionResults = pgTable(
  'artist_session_results',
  {
    id: serial('id').primaryKey(),
    challengeId: integer('challenge_id')
      .notNull()
      .references(() => artistChallenges.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id),
    guestId: text('guest_id'),
    currentRound: integer('current_round').notNull().default(0), // 0-9, round in progress
    songsCorrect: integer('songs_correct').notNull().default(0),
    totalGuessesUsed: integer('total_guesses_used').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    timeTakenSeconds: integer('time_taken_seconds'), // null until completed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('artist_session_user_challenge_idx').on(table.userId, table.challengeId),
    uniqueIndex('artist_session_guest_challenge_idx').on(table.guestId, table.challengeId),
  ],
);

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type DailyPuzzle = typeof dailyPuzzles.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type GameResult = typeof gameResults.$inferSelect;
export type NewGameResult = typeof gameResults.$inferInsert;
export type UserStats = typeof userStats.$inferSelect;
export type ArtistChallenge = typeof artistChallenges.$inferSelect;
export type ArtistChallengeTrack = typeof artistChallengeTracks.$inferSelect;
export type NewArtistChallengeTrack = typeof artistChallengeTracks.$inferInsert;
export type ArtistSessionResult = typeof artistSessionResults.$inferSelect;
export type ArtistRoundGuess = typeof artistRoundGuesses.$inferSelect;
export type NewArtistRoundGuess = typeof artistRoundGuesses.$inferInsert;
export type ArtistTrackPool = typeof artistTrackPools.$inferSelect;
export type DailyPuzzleStart = typeof dailyPuzzleStarts.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type SurvivalRun = typeof survivalRuns.$inferSelect;
