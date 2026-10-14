import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { FeatureStatus } from "@ganeshdole/brainbox-shared";

import { projects } from "./projects.ts";

// One thing a project's users want built, as the customer tracks it. Its
// requests are the feature-request issues pointing at it (issues.feature_id).
export const features = pgTable(
  "features",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<FeatureStatus>().notNull().default("under_review"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("features_project_id_idx").on(t.projectId)],
);
