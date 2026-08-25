CREATE TABLE "fandom_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"deezer_artist_id" text NOT NULL,
	"artist_name" text NOT NULL,
	"artist_picture_url" text,
	"fan_score" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fandom_memberships" ADD CONSTRAINT "fandom_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fandom_memberships_user_artist_idx" ON "fandom_memberships" USING btree ("user_id","deezer_artist_id");--> statement-breakpoint
CREATE INDEX "fandom_memberships_artist_score_idx" ON "fandom_memberships" USING btree ("deezer_artist_id","fan_score");