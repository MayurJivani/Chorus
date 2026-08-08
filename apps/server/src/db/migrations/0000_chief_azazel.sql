CREATE TABLE "artist_challenge_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"position" integer NOT NULL,
	"deezer_track_id" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_art_url" text,
	"duration_seconds" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"deezer_artist_id" text NOT NULL,
	"artist_name" text NOT NULL,
	"challenge_date" text NOT NULL,
	"include_features" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_round_guesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"position" integer NOT NULL,
	"correct" boolean NOT NULL,
	"snippet_stage_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_session_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"user_id" text,
	"guest_id" text,
	"current_round" integer DEFAULT 0 NOT NULL,
	"songs_correct" integer DEFAULT 0 NOT NULL,
	"total_guesses_used" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"time_taken_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_puzzles" (
	"id" serial PRIMARY KEY NOT NULL,
	"puzzle_date" text NOT NULL,
	"song_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_puzzles_puzzle_date_unique" UNIQUE("puzzle_date")
);
--> statement-breakpoint
CREATE TABLE "game_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"puzzle_id" integer NOT NULL,
	"won" boolean NOT NULL,
	"guesses_used" integer NOT NULL,
	"snippet_stage_reached" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"deezer_track_id" text NOT NULL,
	"preview_url" text NOT NULL,
	"album_art_url" text,
	"duration_seconds" integer NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_deezer_track_id_unique" UNIQUE("deezer_track_id")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"owner_key" text PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"max_streak" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"guess_dist_1" integer DEFAULT 0 NOT NULL,
	"guess_dist_2" integer DEFAULT 0 NOT NULL,
	"guess_dist_3" integer DEFAULT 0 NOT NULL,
	"guess_dist_4" integer DEFAULT 0 NOT NULL,
	"guess_dist_5" integer DEFAULT 0 NOT NULL,
	"guess_dist_6" integer DEFAULT 0 NOT NULL,
	"last_played_date" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "artist_challenge_tracks" ADD CONSTRAINT "artist_challenge_tracks_challenge_id_artist_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."artist_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_round_guesses" ADD CONSTRAINT "artist_round_guesses_session_id_artist_session_results_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."artist_session_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_session_results" ADD CONSTRAINT "artist_session_results_challenge_id_artist_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."artist_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_session_results" ADD CONSTRAINT "artist_session_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_puzzles" ADD CONSTRAINT "daily_puzzles_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artist_challenge_tracks_challenge_position_idx" ON "artist_challenge_tracks" USING btree ("challenge_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_challenges_artist_date_features_idx" ON "artist_challenges" USING btree ("deezer_artist_id","challenge_date","include_features");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_round_guesses_session_position_idx" ON "artist_round_guesses" USING btree ("session_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_session_user_challenge_idx" ON "artist_session_results" USING btree ("user_id","challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artist_session_guest_challenge_idx" ON "artist_session_results" USING btree ("guest_id","challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzles_date_idx" ON "daily_puzzles" USING btree ("puzzle_date");--> statement-breakpoint
CREATE UNIQUE INDEX "game_results_user_puzzle_idx" ON "game_results" USING btree ("user_id","puzzle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_results_guest_puzzle_idx" ON "game_results" USING btree ("guest_id","puzzle_id");