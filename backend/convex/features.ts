import { v } from "convex/values";

import type { DatabaseWriter } from "./_generated/server";
import { newestFirst, serverMutation, serverQuery, strip } from "./lib/server.ts";
import { featureStatus, nullable } from "./validators.ts";

// Store.features. See src/store/types.ts for the contract. Convex has no
// foreign keys, so deleting or merging a feature moves its requests by hand,
// as Postgres's ON DELETE SET NULL and the merge transaction do there.

export const listForProject = serverQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("features")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return Promise.all(
      newestFirst(rows).map(async (row) => {
        const requests = await ctx.db
          .query("issues")
          .withIndex("by_feature", (q) => q.eq("featureId", row.id))
          .collect();
        return { ...strip(row), requestCount: requests.length };
      }),
    );
  },
});

export const get = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("features")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    return row && strip(row);
  },
});

export const create = serverMutation({
  args: {
    projectId: v.string(),
    title: v.string(),
    description: nullable(v.string()),
    status: v.optional(featureStatus),
  },
  handler: async (ctx, { status, ...input }) => {
    const now = Date.now();
    const record = {
      ...input,
      id: crypto.randomUUID(),
      status: status ?? "under_review",
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.insert("features", record);
    return record;
  },
});

export const update = serverMutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(nullable(v.string())),
    status: v.optional(featureStatus),
  },
  handler: async (ctx, { id, ...patch }) => {
    const row = await ctx.db
      .query("features")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
    const updated = await ctx.db.get(row._id);
    return updated && strip(updated);
  },
});

/** Points every request of `fromId` at `intoId` (null: back to waiting). */
async function moveRequests(db: DatabaseWriter, fromId: string, intoId: string | null): Promise<void> {
  const requests = await db
    .query("issues")
    .withIndex("by_feature", (q) => q.eq("featureId", fromId))
    .collect();
  for (const request of requests) await db.patch(request._id, { featureId: intoId });
}

export const remove = serverMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("features")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return;
    await moveRequests(ctx.db, id, null);
    await ctx.db.delete(row._id);
  },
});

export const merge = serverMutation({
  args: { fromId: v.string(), intoId: v.string() },
  handler: async (ctx, { fromId, intoId }) => {
    const from = await ctx.db
      .query("features")
      .withIndex("with_id", (q) => q.eq("id", fromId))
      .unique();
    const into = await ctx.db
      .query("features")
      .withIndex("with_id", (q) => q.eq("id", intoId))
      .unique();
    if (!from || !into) return;
    await moveRequests(ctx.db, fromId, intoId);
    await ctx.db.delete(from._id);
    await ctx.db.patch(into._id, { updatedAt: Date.now() });
  },
});
