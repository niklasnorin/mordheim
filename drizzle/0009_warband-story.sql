CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"warband_id" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warband_chapters" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warband_chapters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"warband_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"author_id" text,
	"author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warband_chapters" ADD CONSTRAINT "warband_chapters_warband_id_warbands_id_fk" FOREIGN KEY ("warband_id") REFERENCES "public"."warbands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_warband_idx" ON "images" USING btree ("warband_id");--> statement-breakpoint
CREATE INDEX "warband_chapters_warband_idx" ON "warband_chapters" USING btree ("warband_id");