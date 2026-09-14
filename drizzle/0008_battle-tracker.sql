CREATE TABLE "scenario_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" text NOT NULL,
	"turn" integer NOT NULL,
	"kind" text NOT NULL,
	"warband_id" text,
	"points" integer DEFAULT 0 NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"author_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_out_of_action" ADD COLUMN "turn" integer;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "turn" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "tally" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenario_events" ADD CONSTRAINT "scenario_events_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenario_events_scenario_idx" ON "scenario_events" USING btree ("scenario_id");