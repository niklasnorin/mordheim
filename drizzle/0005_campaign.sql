CREATE TABLE "curfew_content" (
	"id" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curfew_content_revisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "curfew_content_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"version" integer NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"warband_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"rank" text DEFAULT 'henchman' NOT NULL,
	"portrait" text DEFAULT '' NOT NULL,
	"epithet" text DEFAULT '' NOT NULL,
	"dead" boolean DEFAULT false NOT NULL,
	"death" jsonb,
	"stats" jsonb NOT NULL,
	"experience" integer,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"injuries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lore" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"headline" text NOT NULL,
	"byline" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"notice" boolean DEFAULT false NOT NULL,
	"location_id" text DEFAULT 'mordheim' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_members" (
	"scenario_id" text NOT NULL,
	"member_id" text NOT NULL,
	"warband_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"highlight" text DEFAULT '' NOT NULL,
	"lowlight" text DEFAULT '' NOT NULL,
	"stats" jsonb,
	"experience" integer,
	CONSTRAINT "scenario_members_scenario_id_member_id_pk" PRIMARY KEY("scenario_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "scenario_out_of_action" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_out_of_action_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" text NOT NULL,
	"attacker_id" text NOT NULL,
	"target_id" text,
	"target" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_revisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scenario_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scenario_id" text NOT NULL,
	"battle" jsonb NOT NULL,
	"author_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_warbands" (
	"scenario_id" text NOT NULL,
	"warband_id" text NOT NULL,
	"result" text,
	"prologue" text DEFAULT '' NOT NULL,
	"epilogue" text DEFAULT '' NOT NULL,
	"accomplishments" text DEFAULT '' NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lowlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" integer,
	"wyrdstone" integer,
	"gold" integer,
	CONSTRAINT "scenario_warbands_scenario_id_warband_id_pk" PRIMARY KEY("scenario_id","warband_id")
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"title" text NOT NULL,
	"played_on" text NOT NULL,
	"rulebook_scenario" text,
	"custom_rules" text DEFAULT '' NOT NULL,
	"win_condition" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"chronicle" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"prologue" text DEFAULT '' NOT NULL,
	"battle" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"epilogue" text DEFAULT '' NOT NULL,
	"battle_open" boolean DEFAULT false NOT NULL,
	"loot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaign_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"puzzle" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warbands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"sigil" text NOT NULL,
	"crest" text,
	"owner_id" text,
	"player" text DEFAULT '' NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"wyrdstone" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"lore" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_members" ADD CONSTRAINT "scenario_members_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_members" ADD CONSTRAINT "scenario_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_out_of_action" ADD CONSTRAINT "scenario_out_of_action_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_revisions" ADD CONSTRAINT "scenario_revisions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_warbands" ADD CONSTRAINT "scenario_warbands_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_warbands" ADD CONSTRAINT "scenario_warbands_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warbands" ADD CONSTRAINT "warbands_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curfew_content_revisions_content_idx" ON "curfew_content_revisions" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "members_warband_idx" ON "members" USING btree ("warband_id");--> statement-breakpoint
CREATE INDEX "scenario_members_member_idx" ON "scenario_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "scenario_ooa_scenario_idx" ON "scenario_out_of_action" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "scenario_revisions_scenario_idx" ON "scenario_revisions" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warbands_owner_idx" ON "warbands" USING btree ("owner_id");