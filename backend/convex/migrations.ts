import { serverMutation } from "./lib/server.ts";

/**
 * Moves projects and connections from Accounts to Teams, as drizzle/0012
 * does for Postgres. Every Account that owns one gets a Team of its own, with
 * the Account's user id as the Team id and the Account as Owner. Safe to run
 * again: rows already moved are skipped.
 *
 *   npx convex run migrations:teams '{"secret":"<BRAINBOX_SERVER_SECRET>"}'
 */
export const teams = serverMutation({
  args: {},
  handler: async (ctx) => {
    const owners = new Set<string>();
    const projects = (await ctx.db.query("projects").collect()).filter((p) => p.teamId === undefined);
    const connections = (await ctx.db.query("connections").collect()).filter((c) => c.teamId === undefined);
    for (const row of [...projects, ...connections]) {
      if (row.ownerId !== undefined) owners.add(row.ownerId);
    }

    for (const ownerId of owners) {
      const team = await ctx.db
        .query("teams")
        .withIndex("with_id", (q) => q.eq("id", ownerId))
        .unique();
      if (team) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("with_id", (q) => q.eq("id", ownerId))
        .unique();
      const name = user?.name?.trim() || user?.email || "My";
      const now = Date.now();
      await ctx.db.insert("teams", { id: ownerId, name: `${name}'s team`, createdAt: now });
      await ctx.db.insert("teamMembers", { teamId: ownerId, userId: ownerId, role: "owner", createdAt: now });
    }

    for (const row of projects) {
      if (row.ownerId !== undefined) await ctx.db.patch(row._id, { teamId: row.ownerId, ownerId: undefined });
    }
    for (const row of connections) {
      if (row.ownerId !== undefined) await ctx.db.patch(row._id, { teamId: row.ownerId, ownerId: undefined });
    }
    return { teams: owners.size, projects: projects.length, connections: connections.length };
  },
});
