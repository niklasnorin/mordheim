CREATE TABLE "curfew_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "curfew_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"night" integer NOT NULL,
	"ledgers" integer NOT NULL,
	"nights" integer NOT NULL,
	"dispatches" integer NOT NULL,
	"duration_ms" integer NOT NULL
);
