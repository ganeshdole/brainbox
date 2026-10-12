import { v } from "convex/values";

import { serverQuery, strip } from "./lib/server.ts";

// Store.billing. See src/store/types.ts for the contract.

export const subscriptionFor = serverQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row && strip(row);
  },
});
