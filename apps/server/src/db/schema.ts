import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const songs = sqliteTable('songs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  deezerTrackId: text('deezer_track_id').notNull().unique(),
  previewUrl: text('preview_url').notNull(),
  albumArtUrl: text('album_art_url'),
  durationSeconds: integer('duration_seconds').notNull(),
  verifiedAt: text('verified_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const dailyPuzzles = sqliteTable(
  'daily_puzzles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    puzzleDate: text('puzzle_date').notNull().unique(),
    songId: integer('song_id')
      .notNull()
      .references(() => songs.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('daily_puzzles_date_idx').on(table.puzzleDate)],
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastLoginAt: text('last_login_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // SHA-256 hash of the opaque token held in the cookie
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guestId: text('guest_id').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const gameResults = sqliteTable(
  'game_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').references(() => users.id),
    guestId: text('guest_id'),
    puzzleId: integer('puzzle_id')
      .notNull()
      .references(() => dailyPuzzles.id),
    won: integer('won', { mode: 'boolean' }).notNull(),
    guessesUsed: integer('guesses_used').notNull(),
    snippetStageReached: integer('snippet_stage_reached').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('game_results_user_puzzle_idx').on(table.userId, table.puzzleId),
    uniqueIndex('game_results_guest_puzzle_idx').on(table.guestId, table.puzzleId),
  ],
);

export const userStats = sqliteTable('user_stats', {
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
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const artistChallenges = sqliteTable(
  'artist_challenges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deezerArtistId: text('deezer_artist_id').notNull(),
    artistName: text('artist_name').notNull(),
    challengeDate: text('challenge_date').notNull(), // UTC 'YYYY-MM-DD'
    // Part of the challenge's identity, not just a display preference: including
    // featured/collaboration tracks changes which songs are eligible, so "with features" and
    // "without" are two distinct (still each shared/deterministic) daily challenges.
    includeFeatures: integer('include_features', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('artist_challenges_artist_date_features_idx').on(
      table.deezerArtistId,
      table.challengeDate,
      table.includeFeatures,
    ),
  ],
);

export const artistChallengeTracks = sqliteTable(
  'artist_challenge_tracks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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

export const artistSessionResults = sqliteTable(
  'artist_session_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    challengeId: integer('challenge_id')
      .notNull()
      .references(() => artistChallenges.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id),
    guestId: text('guest_id'),
    currentRound: integer('current_round').notNull().default(0), // 0-9, round in progress
    songsCorrect: integer('songs_correct').notNull().default(0),
    totalGuessesUsed: integer('total_guesses_used').notNull().default(0),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    timeTakenSeconds: integer('time_taken_seconds'), // null until completed
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
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
