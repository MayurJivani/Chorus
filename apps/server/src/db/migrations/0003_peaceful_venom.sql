CREATE TABLE "daily_puzzle_starts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_key" text NOT NULL,
	"puzzle_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_results" ADD COLUMN "time_taken_seconds" integer;--> statement-breakpoint
ALTER TABLE "daily_puzzle_starts" ADD CONSTRAINT "daily_puzzle_starts_puzzle_id_daily_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."daily_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_puzzle_starts_owner_puzzle_idx" ON "daily_puzzle_starts" USING btree ("owner_key","puzzle_id");