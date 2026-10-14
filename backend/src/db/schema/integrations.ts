import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ConnectionAuth,
  ConnectionStatus,
  DeliveryStatus,
  DestinationConfig,
  IntegrationProvider,
  WorkItemStateCategory,
} from "@ganeshdole/brainbox-shared";

import type { SealedCredentials } from "../../store/credentials.ts";

import { issues } from "./issues.ts";
import { projects } from "./projects.ts";
import { teams } from "./teams.ts";

// Team-level: one row per GitHub App install or Azure DevOps organization per
// Team, shared by its projects. `credentials` is sealed (store/credentials.ts).
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    externalId: text("external_id").notNull(),
    label: text("label").notNull(),
    auth: text("auth").$type<ConnectionAuth>().notNull().default("app"),
    status: text("status").$type<ConnectionStatus>().notNull().default("active"),
    credentials: text("credentials").$type<SealedCredentials>(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_connections_team_provider_external_id_key").on(
      t.teamId,
      t.provider,
      t.externalId,
    ),
  ],
);

// Project-level: where a project's reports go. One per provider per project.
export const projectDestinations = pgTable(
  "project_destinations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull(),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    config: jsonb("config").$type<DestinationConfig>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_destinations_project_provider_key").on(t.projectId, t.provider),
    // The generated name is 64 characters, one over Postgres's identifier limit.
    foreignKey({
      name: "project_destinations_connection_id_fk",
      columns: [t.connectionId],
      foreignColumns: [integrationConnections.id],
    }).onDelete("cascade"),
  ],
);

// The unique index is the idempotency guard for dispatch. destination_id is
// set null on disconnect so the "GitHub #42" link survives.
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    destinationId: text("destination_id").references(() => projectDestinations.id, {
      onDelete: "set null",
    }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    status: text("status").$type<DeliveryStatus>().notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("deliveries_issue_destination_key").on(t.issueId, t.destinationId),
    // Service hooks name the work item; this finds the issue behind it.
    index("deliveries_provider_external_id_idx").on(t.provider, t.externalId),
  ],
);

// What the tool reported back about a delivered ticket: one row per work item
// revision that changed state or added a comment. The unique index is what
// makes a repeated service hook a no-op.
export const workItemUpdates = pgTable(
  "work_item_updates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    externalId: text("external_id").notNull(),
    revision: integer("revision").notNull(),
    type: text("type"),
    state: text("state").notNull(),
    reason: text("reason"),
    category: text("category").$type<WorkItemStateCategory>(),
    previousState: text("previous_state").notNull(),
    previousReason: text("previous_reason"),
    previousCategory: text("previous_category").$type<WorkItemStateCategory>(),
    changedByName: text("changed_by_name"),
    changedByEmail: text("changed_by_email"),
    changedAt: timestamp("changed_at", { mode: "date", withTimezone: true }).notNull(),
    comment: text("comment"),
    notifyStatus: text("notify_status").$type<"sent" | "failed">(),
    notifyError: text("notify_error"),
    notifyAttempts: integer("notify_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_item_updates_issue_item_revision_key").on(t.issueId, t.provider, t.externalId, t.revision),
  ],
);
