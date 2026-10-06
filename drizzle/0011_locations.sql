CREATE TABLE "location_points" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"x" real,
	"y" real,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_stock" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "location_stock_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location_id" text NOT NULL,
	"item_id" text NOT NULL,
	"custom" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"available" boolean,
	"price" text,
	"rarity" integer,
	"notes" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"map" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "images" ALTER COLUMN "warband_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "location_id" text;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "point_id" integer;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "map_x" real;--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "map_y" real;--> statement-breakpoint
ALTER TABLE "location_points" ADD CONSTRAINT "location_points_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_stock" ADD CONSTRAINT "location_stock_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_points_location_idx" ON "location_points" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_stock_item_idx" ON "location_stock" USING btree ("location_id","item_id");--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_point_id_location_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."location_points"("id") ON DELETE set null ON UPDATE no action;