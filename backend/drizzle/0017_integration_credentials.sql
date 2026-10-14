ALTER TABLE "integration_connections" ADD COLUMN "auth" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "credentials" text;