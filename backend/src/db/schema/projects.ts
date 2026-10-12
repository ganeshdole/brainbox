import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ProjectKey } from "@brainbox-sh/shared";

import { users } from "./auth-schema.ts";

export const projects = pgTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // owner = the Account (auth `users` row)
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  key: text("key").$type<ProjectKey>().notNull().unique(),
  // CORS / ingest allowlist (empty = allow all in v0). Used in step 3.
  allowedOrigins: jsonb("allowed_origins")
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});
