CREATE TABLE "duels" (
	"id" serial PRIMARY KEY NOT NULL,
	"challenge_id" integer NOT NULL,
	"challenger_id" text NOT NULL,
	"opponent_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"challenger_rating_before" integer,
	"opponent_rating_before" integer,
	"challenger_rating_after" integer,
	"opponent_rating_after" integer,
	"winner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rating" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rated_duels" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_challenge_id_artist_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."artist_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_challenger_id_users_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duels_challenge_idx" ON "duels" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "duels_challenger_idx" ON "duels" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "duels_opponent_idx" ON "duels" USING btree ("opponent_id");