ALTER TABLE "images" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "portrait_image" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "portrait_source" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "portrait_crop" jsonb;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_member_idx" ON "images" USING btree ("member_id");