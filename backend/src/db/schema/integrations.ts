import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DeliveryStatus, DestinationConfig, IntegrationProvider } from "@brainbox-sh/shared";

import { users } from "./auth-schema.ts";
import { issues } from "./issues.ts";
import { projects } from "./projects.ts";

// Account-level: one row per GitHub App install per Account, shared by its projects.
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    externalId: text("external_id").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_connections_owner_provider_external_id_key").on(
      t.ownerId,
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
  (t) => [uniqueIndex("deliveries_issue_destination_key").on(t.issueId, t.destinationId)],
);
