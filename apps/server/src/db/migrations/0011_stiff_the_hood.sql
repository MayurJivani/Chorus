ALTER TABLE "duels" ALTER COLUMN "challenge_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "challenger_score" integer;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "opponent_score" integer;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "forfeited" boolean DEFAULT false NOT NULL;