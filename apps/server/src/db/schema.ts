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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('game_results_user_puzzle_idx').on(table.userId, table.puzzleId),
    uniqueIndex('game_results_guest_puzzle_idx').on(table.guestId, table.puzzleId),
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
    deezerArtistId: text('deezer_artist_id').notNull(),
    artistName: text('artist_name').notNull(),
    challengeDate: text('challenge_date').notNull(), // UTC 'YYYY-MM-DD' (+ optional UUID suffix for randomized challenges)
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
