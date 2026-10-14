ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "integration_connections" DROP CONSTRAINT "integration_connections_owner_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "integration_connections_owner_provider_external_id_key";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_team_provider_external_id_key" ON "integration_connections" USING btree ("team_id","provider","external_id");--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "integration_connections" DROP COLUMN "owner_id";