import { v } from "convex/values";

import { serverMutation } from "./lib/server.ts";

// Store.signIn: attempts at sign-in codes per email (src/auth/code-attempts.ts).
// Times are epoch milliseconds. Each mutation is a transaction, so attempts
// arriving together are counted one after another.

/** Records an attempt made `at` and returns how many fall at or after `since`,
 *  this one included, keeping the latest `keep` times. Records nothing
 *  (returns 0) when the email has no code pending. */
export const recordAttempt = serverMutation({
  args: { identifier: v.string(), at: v.number(), since: v.number(), keep: v.number() },
  handler: async (ctx, { identifier, at, since, keep }) => {
    const pending = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", identifier))
      .filter((q) => q.gt(q.field("expires"), at))
      .first();
    if (!pending) return 0;

    const row = await ctx.db
      .query("signInAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    const recent = (row?.attemptedAt ?? []).filter((time) => time >= since);
    const attemptedAt = [...recent, at].slice(-keep);
    if (row) await ctx.db.patch(row._id, { attemptedAt });
    else await ctx.db.insert("signInAttempts", { identifier, attemptedAt });
    return recent.length + 1;
  },
});

/** Stores a new code and deletes the email's earlier ones, in one transaction. */
export const replaceCode = serverMutation({
  args: { identifier: v.string(), token: v.string(), expires: v.number() },
  handler: async (ctx, code) => {
    const pending = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", code.identifier))
      .collect();
    for (const token of pending) await ctx.db.delete(token._id);
    await ctx.db.insert("verificationTokens", code);
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
