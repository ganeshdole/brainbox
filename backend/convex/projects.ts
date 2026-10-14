import { v } from "convex/values";

import { newestFirst, removeDestination, serverMutation, serverQuery, strip } from "./lib/server.ts";

// Store.projects. See src/store/types.ts for the contract.

export const listForOwner = serverQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    return newestFirst(rows).map(strip);
  },
});

export const create = serverMutation({
  args: {
    ownerId: v.string(),
    name: v.string(),
    key: v.string(),
    allowedOrigins: v.array(v.string()),
  },
  handler: async (ctx, input) => {
    const taken = await ctx.db
      .query("projects")
      .withIndex("by_key", (q) => q.eq("key", input.key))
      .unique();
    if (taken) throw new Error("project key already in use");
    const record = { ...input, id: crypto.randomUUID(), createdAt: Date.now(), issueCount: 0 };
    await ctx.db.insert("projects", record);
    return record;
  },
});

export const get = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("projects")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    return row && strip(row);
  },
});

export const getByKey = serverQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("projects")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return row && strip(row);
  },
});

export const update = serverMutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    allowedOrigins: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, name, allowedOrigins }) => {
    const row = await ctx.db
      .query("projects")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      ...(name !== undefined && { name }),
      ...(allowedOrigins !== undefined && { allowedOrigins }),
    });
    const updated = await ctx.db.get(row._id);
    return updated && strip(updated);
  },
});

/** Removes the project with its issues, their deliveries, and its destinations. */
export const remove = serverMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("projects")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return;

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const issue of issues) {
      const deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_issue_destination", (q) => q.eq("issueId", issue.id))
        .collect();
      for (const delivery of deliveries) await ctx.db.delete(delivery._id);
      await ctx.db.delete(issue._id);
    }

    const features = await ctx.db
      .query("features")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const feature of features) await ctx.db.delete(feature._id);

    const destinations = await ctx.db
      .query("destinations")
      .withIndex("by_project_provider", (q) => q.eq("projectId", id))
      .collect();
    for (const destination of destinations) await removeDestination(ctx.db, destination.id);

    await ctx.db.delete(row._id);
  },
});
