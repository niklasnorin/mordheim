CREATE TABLE "curfew_moves" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "curfew_moves_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location_id" text NOT NULL,
	"from_night" integer NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL
);
