ALTER TABLE "scenarios" ADD COLUMN "order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "active" text;