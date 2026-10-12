CREATE TABLE "sign_in_attempts" (
	"identifier" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
