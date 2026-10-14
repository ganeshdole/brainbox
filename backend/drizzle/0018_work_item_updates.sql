CREATE TABLE "work_item_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"revision" integer NOT NULL,
	"type" text,
	"state" text NOT NULL,
	"reason" text,
	"category" text,
	"previous_state" text NOT NULL,
	"previous_reason" text,
	"previous_category" text,
	"changed_by_name" text,
	"changed_by_email" text,
	"changed_at" timestamp with time zone NOT NULL,
	"comment" text,
	"notify_status" text,
	"notify_error" text,
	"notify_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_item_updates" ADD CONSTRAINT "work_item_updates_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_updates_issue_item_revision_key" ON "work_item_updates" USING btree ("issue_id","provider","external_id","revision");--> statement-breakpoint
CREATE INDEX "deliveries_provider_external_id_idx" ON "deliveries" USING btree ("provider","external_id");