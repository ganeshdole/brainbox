ALTER TABLE "issues" ADD COLUMN "kind" text DEFAULT 'bug' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "importance" text;