CREATE TABLE "location_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location_id" text NOT NULL,
	"point_id" integer,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"lean" text DEFAULT 'even' NOT NULL,
	"withheld" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warband_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warband_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"warband_id" text NOT NULL,
	"scenario_id" text,
	"seq" integer NOT NULL,
	"job_id" integer,
	"location_id" text,
	"point_id" integer,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"lean" text DEFAULT 'even' NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taken_by" text,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_jobs" ADD CONSTRAINT "location_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_jobs" ADD CONSTRAINT "location_jobs_point_id_location_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."location_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD CONSTRAINT "warband_jobs_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD CONSTRAINT "warband_jobs_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warband_jobs" ADD CONSTRAINT "warband_jobs_job_id_location_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."location_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_jobs_location_idx" ON "location_jobs" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_jobs_title_idx" ON "location_jobs" USING btree ("location_id","title");--> statement-breakpoint
CREATE INDEX "warband_jobs_warband_idx" ON "warband_jobs" USING btree ("warband_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warband_jobs_once_idx" ON "warband_jobs" USING btree ("warband_id","scenario_id","seq");