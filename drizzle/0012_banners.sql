ALTER TABLE "locations" ADD COLUMN "banner" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "banner_focus" text DEFAULT '50% 50%' NOT NULL;