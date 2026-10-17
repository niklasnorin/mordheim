ALTER TABLE "images" ADD COLUMN "scenario_id" text;--> statement-breakpoint
ALTER TABLE "scenario_events" ADD COLUMN "image_id" text;--> statement-breakpoint
ALTER TABLE "scenario_events" ADD COLUMN "preview_id" text;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_events" ADD CONSTRAINT "scenario_events_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_events" ADD CONSTRAINT "scenario_events_preview_id_images_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_scenario_idx" ON "images" USING btree ("scenario_id");