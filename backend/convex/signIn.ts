import { v } from "convex/values";

import { serverMutation } from "./lib/server.ts";

// Store.signIn: attempts at sign-in codes per email (src/auth/code-attempts.ts).
// Times are epoch milliseconds. Each mutation is a transaction, so attempts
// arriving together are counted one after another.

/** Counts one attempt and returns the count, restarting a count older than
 *  `since`. Counts nothing (returns 0) when the email has no code pending. */
export const recordAttempt = serverMutation({
  args: { identifier: v.string(), since: v.number() },
  handler: async (ctx, { identifier, since }) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", identifier))
      .filter((q) => q.gt(q.field("expires"), now))
      .first();
    if (!pending) return 0;

    const row = await ctx.db
      .query("signInAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (!row) {
      await ctx.db.insert("signInAttempts", { identifier, attempts: 1, windowStartedAt: now });
      return 1;
    }
    const attempts = row.windowStartedAt >= since ? row.attempts + 1 : 1;
    await ctx.db.patch(row._id, {
      attempts,
      windowStartedAt: attempts === 1 ? now : row.windowStartedAt,
    });
    return attempts;
  },
});

/** Deletes every code still pending for the email. */
export const revokeCodes = serverMutation({
  args: { identifier: v.string() },
  handler: async (ctx, { identifier }) => {
    const pending = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", identifier))
      .collect();
    for (const token of pending) await ctx.db.delete(token._id);
  },
});

/** Deletes the email's count. */
export const forgetAttempts = serverMutation({
  args: { identifier: v.string() },
  handler: async (ctx, { identifier }) => {
    const row = await ctx.db
      .query("signInAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
