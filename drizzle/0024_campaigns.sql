CREATE TABLE "campaign_locations" (
	"campaign_id" text NOT NULL,
	"location_id" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_locations_campaign_id_location_id_pk" PRIMARY KEY("campaign_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"setting" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"start" text NOT NULL,
	"timezone" text NOT NULL,
	"anchor" jsonb NOT NULL,
	"tuning" jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "curfew_documents" (
	"campaign_id" text NOT NULL,
	"id" text NOT NULL,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curfew_documents_campaign_id_id_pk" PRIMARY KEY("campaign_id","id")
);
--> statement-breakpoint
ALTER TABLE "cryer_dispatches" DROP CONSTRAINT "cryer_dispatches_key_unique";--> statement-breakpoint
DROP INDEX "cryer_dispatches_night_idx";--> statement-breakpoint
DROP INDEX "curfew_content_revisions_content_idx";--> statement-breakpoint
DROP INDEX "curfew_ledgers_owner_idx";--> statement-breakpoint
DROP INDEX "location_jobs_title_idx";--> statement-breakpoint
DROP INDEX "location_stock_item_idx";--> statement-breakpoint
DROP INDEX "warbands_owner_idx";--> statement-breakpoint
ALTER TABLE "cryer_dispatches" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "curfew_content_revisions" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "curfew_ledgers" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "curfew_moves" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "curfew_runs" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "location_jobs" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "location_stock" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "carried_from_id" text;--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "warbands" ADD COLUMN "campaign_id" text DEFAULT 'mordheim-2000' NOT NULL;--> statement-breakpoint
ALTER TABLE "warbands" ADD COLUMN "carried_from_id" text;--> statement-breakpoint
ALTER TABLE "campaign_locations" ADD CONSTRAINT "campaign_locations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_locations" ADD CONSTRAINT "campaign_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cryer_dispatches_key_idx" ON "cryer_dispatches" USING btree ("campaign_id","key");--> statement-breakpoint
CREATE INDEX "scenarios_campaign_idx" ON "scenarios" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "warbands_campaign_idx" ON "warbands" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "cryer_dispatches_night_idx" ON "cryer_dispatches" USING btree ("campaign_id","night");--> statement-breakpoint
CREATE INDEX "curfew_content_revisions_content_idx" ON "curfew_content_revisions" USING btree ("campaign_id","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curfew_ledgers_owner_idx" ON "curfew_ledgers" USING btree ("campaign_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_jobs_title_idx" ON "location_jobs" USING btree ("campaign_id","location_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "location_stock_item_idx" ON "location_stock" USING btree ("campaign_id","location_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warbands_owner_idx" ON "warbands" USING btree ("campaign_id","owner_id");