ALTER TABLE "warband_jobs" ADD COLUMN "dice" integer;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD COLUMN "by_hand" boolean DEFAULT false NOT NULL;