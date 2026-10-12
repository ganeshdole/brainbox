import { v } from "convex/values";

import { serverMutation, serverQuery } from "./lib/server.ts";

// The Convex storage driver (src/storage/convex.ts): bytes live in Convex file
// storage, addressed by Brainbox's own "<project>/<issue>/<file>" keys.

/** A one-time URL the backend POSTs the bytes to. */
export const generateUploadUrl = serverMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Points `key` at an uploaded file, replacing (and deleting) any earlier one. */
export const save = serverMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { key, storageId }) => {
    const existing = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.storage.delete(existing.storageId);
      await ctx.db.patch(existing._id, { storageId });
      return;
    }
    await ctx.db.insert("files", { key, storageId });
  },
});

/** A URL that serves the file, or null when nothing is stored under `key`. */
export const url = serverQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return file ? ctx.storage.getUrl(file.storageId) : null;
  },
});
