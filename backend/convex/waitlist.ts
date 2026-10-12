import { v } from "convex/values";

import { serverMutation } from "./lib/server.ts";

// Store.waitlist. See src/store/types.ts for the contract.

/** Null when the email is already on the list. */
export const add = serverMutation({
  args: { email: v.string(), source: v.string() },
  handler: async (ctx, { email, source }) => {
    const existing = await ctx.db
      .query("waitlistSignups")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return null;
    const record = {
      id: crypto.randomUUID(),
      email,
      source,
      emailStatus: "pending" as const,
      emailError: null,
      createdAt: Date.now(),
    };
    await ctx.db.insert("waitlistSignups", record);
    return record;
  },
});

export const setEmailStatus = serverMutation({
  args: {
    id: v.string(),
    outcome: v.union(
      v.object({ status: v.literal("sent") }),
      v.object({ status: v.literal("failed"), error: v.string() }),
    ),
  },
  handler: async (ctx, { id, outcome }) => {
    const row = await ctx.db
      .query("waitlistSignups")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return;
    await ctx.db.patch(
      row._id,
      outcome.status === "sent"
        ? { emailStatus: "sent" }
        : { emailStatus: "failed", emailError: outcome.error },
    );
  },
});
