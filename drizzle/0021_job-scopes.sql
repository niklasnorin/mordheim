ALTER TABLE "location_jobs" ADD COLUMN "scope" text DEFAULT 'errand' NOT NULL;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD COLUMN "scope" text DEFAULT 'errand' NOT NULL;