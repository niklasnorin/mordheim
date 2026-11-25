CREATE TABLE "warband_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warband_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"warband_id" text NOT NULL,
	"kind" text NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"shards" integer DEFAULT 0 NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"members" jsonb,
	"scenario_id" text,
	"author_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"struck" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warbands" ADD COLUMN "roster" jsonb;--> statement-breakpoint
ALTER TABLE "warband_log" ADD CONSTRAINT "warband_log_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warband_log" ADD CONSTRAINT "warband_log_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warband_log_warband_idx" ON "warband_log" USING btree ("warband_id");