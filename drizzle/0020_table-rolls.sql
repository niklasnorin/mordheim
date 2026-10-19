ALTER TABLE "warband_jobs" ADD COLUMN "pick" integer;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD COLUMN "pick_by_hand" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD COLUMN "experience_die" integer;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD COLUMN "experience_by_hand" boolean DEFAULT false NOT NULL;