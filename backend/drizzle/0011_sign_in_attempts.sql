CREATE TABLE "sign_in_attempts" (
	"identifier" text PRIMARY KEY NOT NULL,
	"attempted_at" timestamp with time zone[] NOT NULL
);
