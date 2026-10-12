import { v } from "convex/values";

import { serverMutation } from "./lib/server.ts";

// Store.signIn: wrong sign-in codes per email (src/auth/code-attempts.ts).

/** Counts one wrong code for this email; returns the count so far. */
export const recordFailedCode = serverMutation({
  args: { identifier: v.string() },
  handler: async (ctx, { identifier }) => {
    const row = await ctx.db
      .query("signInFailures")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (!row) {
      await ctx.db.insert("signInFailures", { identifier, failures: 1 });
      return 1;
    }
    await ctx.db.patch(row._id, { failures: row.failures + 1 });
    return row.failures + 1;
  },
});

/** Clears the count; with `revokeCodes`, also every code pending for the email. */
export const reset = serverMutation({
  args: { identifier: v.string(), revokeCodes: v.boolean() },
  handler: async (ctx, { identifier, revokeCodes }) => {
    const row = await ctx.db
      .query("signInFailures")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    if (row) await ctx.db.delete(row._id);
    if (!revokeCodes) return;
    const pending = await ctx.db
      .query("verificationTokens")
      .withIndex("by_identifier_token", (q) => q.eq("identifier", identifier))
      .collect();
    for (const token of pending) await ctx.db.delete(token._id);
  },
});
