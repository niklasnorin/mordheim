CREATE TABLE "curfew_recovery" (
	"user_id" text PRIMARY KEY NOT NULL,
	"phrase_hash" text NOT NULL,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curfew_recovery" ADD CONSTRAINT "curfew_recovery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;