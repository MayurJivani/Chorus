CREATE TABLE "duel_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"rating" integer DEFAULT 1200 NOT NULL,
	"rated_duels" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "duel_ratings" ADD CONSTRAINT "duel_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duel_ratings_user_mode_idx" ON "duel_ratings" USING btree ("user_id","mode");