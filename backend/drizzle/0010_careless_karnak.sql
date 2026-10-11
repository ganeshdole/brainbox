CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"destination_id" text,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"external_url" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_destination_id_project_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."project_destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_destinations" ADD CONSTRAINT "project_destinations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_destinations" ADD CONSTRAINT "project_destinations_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_issue_destination_key" ON "deliveries" USING btree ("issue_id","destination_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_owner_provider_external_id_key" ON "integration_connections" USING btree ("owner_id","provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_destinations_project_provider_key" ON "project_destinations" USING btree ("project_id","provider");