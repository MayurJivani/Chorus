CREATE TABLE `artist_round_guesses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`position` integer NOT NULL,
	`correct` integer NOT NULL,
	`snippet_stage_seconds` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `artist_session_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_round_guesses_session_position_idx` ON `artist_round_guesses` (`session_id`,`position`);
