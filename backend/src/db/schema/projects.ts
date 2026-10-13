import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { ProjectKey } from "@ganeshdole/brainbox-shared";

import { teams } from "./teams.ts";

export const projects = pgTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
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
