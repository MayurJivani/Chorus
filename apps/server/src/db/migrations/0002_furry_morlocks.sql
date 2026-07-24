CREATE TABLE `artist_challenge_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`position` integer NOT NULL,
	`deezer_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album_art_url` text,
	`duration_seconds` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `artist_challenges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_challenge_tracks_challenge_position_idx` ON `artist_challenge_tracks` (`challenge_id`,`position`);--> statement-breakpoint
CREATE TABLE `artist_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deezer_artist_id` text NOT NULL,
	`artist_name` text NOT NULL,
	`challenge_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_challenges_artist_date_idx` ON `artist_challenges` (`deezer_artist_id`,`challenge_date`);--> statement-breakpoint
CREATE TABLE `artist_session_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`challenge_id` integer NOT NULL,
	`user_id` text,
	`guest_id` text,
	`current_round` integer DEFAULT 0 NOT NULL,
	`songs_correct` integer DEFAULT 0 NOT NULL,
	`total_guesses_used` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `artist_challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_session_user_challenge_idx` ON `artist_session_results` (`user_id`,`challenge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `artist_session_guest_challenge_idx` ON `artist_session_results` (`guest_id`,`challenge_id`);