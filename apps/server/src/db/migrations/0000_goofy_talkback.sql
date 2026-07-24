CREATE TABLE `daily_puzzles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puzzle_date` text NOT NULL,
	`song_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_puzzles_puzzle_date_unique` ON `daily_puzzles` (`puzzle_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_puzzles_date_idx` ON `daily_puzzles` (`puzzle_date`);--> statement-breakpoint
CREATE TABLE `game_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`guest_id` text,
	`puzzle_id` integer NOT NULL,
	`won` integer NOT NULL,
	`guesses_used` integer NOT NULL,
	`snippet_stage_reached` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`puzzle_id`) REFERENCES `daily_puzzles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_results_user_puzzle_idx` ON `game_results` (`user_id`,`puzzle_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_results_guest_puzzle_idx` ON `game_results` (`guest_id`,`puzzle_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`guest_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`deezer_track_id` text NOT NULL,
	`preview_url` text NOT NULL,
	`album_art_url` text,
	`duration_seconds` integer NOT NULL,
	`verified_at` text DEFAULT (datetime('now')) NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_deezer_track_id_unique` ON `songs` (`deezer_track_id`);--> statement-breakpoint
CREATE TABLE `user_stats` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`max_streak` integer DEFAULT 0 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`games_won` integer DEFAULT 0 NOT NULL,
	`guess_dist_1` integer DEFAULT 0 NOT NULL,
	`guess_dist_2` integer DEFAULT 0 NOT NULL,
	`guess_dist_3` integer DEFAULT 0 NOT NULL,
	`guess_dist_4` integer DEFAULT 0 NOT NULL,
	`guess_dist_5` integer DEFAULT 0 NOT NULL,
	`guess_dist_6` integer DEFAULT 0 NOT NULL,
	`last_played_date` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);