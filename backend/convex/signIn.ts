import { v } from "convex/values";

import { serverMutation, serverQuery } from "./lib/server.ts";

// Store.signIn: wrong sign-in codes per email (src/auth/code-attempts.ts).
// Times are epoch milliseconds.

/** Wrong codes in a count that started at or after `since`; 0 for an older one. */
export const failedCodes = serverQuery({
  args: { identifier: v.string(), since: v.number() },
  handler: async (ctx, { identifier, since }) => {
    const row = await ctx.db
      .query("signInFailures")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    return row && row.windowStartedAt >= since ? row.failures : 0;
  },
});

/** Counts one wrong code and returns the count, restarting a count older than
 *  `since`. Counts nothing (returns 0) when the email has no code pending. */
export const recordFailedCode = serverMutation({
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
      .query("signInFailures")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (!row) {
      await ctx.db.insert("signInFailures", { identifier, failures: 1, windowStartedAt: now });
      return 1;
    }
    const failures = row.windowStartedAt >= since ? row.failures + 1 : 1;
    await ctx.db.patch(row._id, {
      failures,
      windowStartedAt: failures === 1 ? now : row.windowStartedAt,
    });
    return failures;
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
export const forgetFailures = serverMutation({
  args: { identifier: v.string() },
  handler: async (ctx, { identifier }) => {
    const row = await ctx.db
      .query("signInFailures")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
