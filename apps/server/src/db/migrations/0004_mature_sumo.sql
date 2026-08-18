ALTER TABLE "artist_challenges" ADD COLUMN "source_type" text DEFAULT 'artist' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;