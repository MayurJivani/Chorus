DROP INDEX `artist_challenges_artist_date_idx`;--> statement-breakpoint
ALTER TABLE `artist_challenges` ADD `include_features` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `artist_challenges_artist_date_features_idx` ON `artist_challenges` (`deezer_artist_id`,`challenge_date`,`include_features`);