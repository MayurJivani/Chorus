CREATE TABLE "artist_track_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"deezer_artist_id" text NOT NULL,
	"include_features" boolean DEFAULT false NOT NULL,
	"artist_name" text NOT NULL,
	"artist_picture_url" text,
	"tracks" jsonb NOT NULL,
	"track_count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "artist_track_pools_artist_features_idx" ON "artist_track_pools" USING btree ("deezer_artist_id","include_features");--> statement-breakpoint
CREATE INDEX "artist_track_pools_last_accessed_idx" ON "artist_track_pools" USING btree ("last_accessed_at");