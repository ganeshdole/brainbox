import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { InviteRole, TeamRole } from "@ganeshdole/brainbox-shared";

import { users } from "./auth-schema.ts";

// A Team owns projects and integration connections; people reach them by
// being its members. Teams made for Accounts that predate them carry that
// Account's user id as their own id (drizzle/0012).
export const teams = pgTable("teams", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<TeamRole>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_id_idx").on(t.userId)],
);

// Invites not yet accepted. Accepting one deletes it, so each works once.
// One per (team, email): inviting the same address again replaces it.
export const teamInvites = pgTable(
  "team_invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Lower-cased, as Auth.js stores addresses.
    email: text("email").notNull(),
    role: text("role").$type<InviteRole>().notNull(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("team_invites_team_id_email_key").on(t.teamId, t.email),
    index("team_invites_email_idx").on(t.email),
  ],
);
