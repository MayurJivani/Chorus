CREATE TABLE "survival_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"guest_id" text,
	"guess_mode" text DEFAULT 'search' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"used_track_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_track_id" text,
	"current_title" text,
	"current_artist" text,
	"current_album_art_url" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survival_runs" ADD CONSTRAINT "survival_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "survival_runs_user_idx" ON "survival_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "survival_runs_guest_idx" ON "survival_runs" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "survival_runs_streak_idx" ON "survival_runs" USING btree ("streak");