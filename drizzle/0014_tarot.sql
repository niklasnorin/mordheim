ALTER TABLE "scenario_warbands" ADD COLUMN "tarot" jsonb;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "tarot" boolean DEFAULT false NOT NULL;