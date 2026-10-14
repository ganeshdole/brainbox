import { v } from "convex/values";

import { leavesNoOwner } from "../src/store/team-rules.ts";
import type { DatabaseReader } from "./_generated/server";
import { newestFirst, serverMutation, serverQuery, strip } from "./lib/server.ts";
import { inviteRole, nullable, teamRole } from "./validators.ts";

// Store.teams. See src/store/types.ts for the contract. Mutations are
// serializable in Convex, so the Owner check and the change it guards are one
// atomic step without any locking.

async function findTeam(db: DatabaseReader, id: string) {
  return db
    .query("teams")
    .withIndex("with_id", (q) => q.eq("id", id))
    .unique();
}

async function findMember(db: DatabaseReader, teamId: string, userId: string) {
  return db
    .query("teamMembers")
    .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
    .unique();
}

async function ownerCount(db: DatabaseReader, teamId: string): Promise<number> {
  const rows = await db
    .query("teamMembers")
    .withIndex("by_team_user", (q) => q.eq("teamId", teamId))
    .collect();
  return rows.filter((r) => r.role === "owner").length;
}

export const create = serverMutation({
  args: { name: v.string(), ownerId: v.string() },
  handler: async (ctx, { name, ownerId }) => {
    const team = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    await ctx.db.insert("teams", team);
    await ctx.db.insert("teamMembers", {
      teamId: team.id,
      userId: ownerId,
      role: "owner",
      createdAt: team.createdAt,
    });
    return team;
  },
});

export const get = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await findTeam(ctx.db, id);
    return row && strip(row);
  },
});

export const rename = serverMutation({
  args: { id: v.string(), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const row = await findTeam(ctx.db, id);
    if (!row) return null;
    await ctx.db.patch(row._id, { name });
    return { ...strip(row), name };
  },
});

export const listForUser = serverQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = [];
    for (const membership of memberships) {
      const team = await findTeam(ctx.db, membership.teamId);
      if (team) teams.push({ ...strip(team), role: membership.role });
    }
    return teams.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const membership = serverQuery({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, { teamId, userId }) => {
    const row = await findMember(ctx.db, teamId, userId);
    return row && strip(row);
  },
});

export const members = serverQuery({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    const rows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId))
      .collect();
    const profiles = [];
    for (const row of rows) {
      const user = await ctx.db
        .query("users")
        .withIndex("with_id", (q) => q.eq("id", row.userId))
        .unique();
      if (!user) continue;
      profiles.push({
        ...strip(row),
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
      });
    }
    return profiles.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const setRole = serverMutation({
  args: { teamId: v.string(), userId: v.string(), role: teamRole },
  handler: async (ctx, { teamId, userId, role }) => {
    const member = await findMember(ctx.db, teamId, userId);
    if (!member) return "not_found" as const;
    if (leavesNoOwner(await ownerCount(ctx.db, teamId), member.role, role)) return "last_owner" as const;
    await ctx.db.patch(member._id, { role });
    return "done" as const;
  },
});

export const removeMember = serverMutation({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, { teamId, userId }) => {
    const member = await findMember(ctx.db, teamId, userId);
    if (!member) return "not_found" as const;
    if (leavesNoOwner(await ownerCount(ctx.db, teamId), member.role, null)) return "last_owner" as const;
    await ctx.db.delete(member._id);
    return "done" as const;
  },
});

/** Insert, or replace the open invite for (team, email) under a new id. */
export const createInvite = serverMutation({
  args: {
    teamId: v.string(),
    email: v.string(),
    role: inviteRole,
    invitedBy: nullable(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db
      .query("teamInvites")
      .withIndex("by_team_email", (q) => q.eq("teamId", input.teamId).eq("email", input.email))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    const record = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    await ctx.db.insert("teamInvites", record);
    return record;
  },
});

export const getInvite = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("teamInvites")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    return row && strip(row);
  },
});

export const listInvites = serverQuery({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    const rows = await ctx.db
      .query("teamInvites")
      .withIndex("by_team_email", (q) => q.eq("teamId", teamId))
      .collect();
    return newestFirst(rows).map(strip);
  },
});

export const invitesForEmail = serverQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const rows = await ctx.db
      .query("teamInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    return newestFirst(rows).map(strip);
  },
});

export const revokeInvite = serverMutation({
  args: { teamId: v.string(), id: v.string() },
  handler: async (ctx, { teamId, id }) => {
    const row = await ctx.db
      .query("teamInvites")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (row && row.teamId === teamId) await ctx.db.delete(row._id);
  },
});

export const acceptInvite = serverMutation({
  args: { id: v.string(), userId: v.string(), now: v.number() },
  handler: async (ctx, { id, userId, now }) => {
    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!invite) return { status: "not_found" as const };
    if (invite.expiresAt <= now) return { status: "expired" as const };
    await ctx.db.delete(invite._id);
    if (!(await findMember(ctx.db, invite.teamId, userId))) {
      await ctx.db.insert("teamMembers", {
        teamId: invite.teamId,
        userId,
        role: invite.role,
        createdAt: Date.now(),
      });
    }
    return { status: "accepted" as const, teamId: invite.teamId };
  },
});
