import { v } from "convex/values";

import { planSubscriptionWrite } from "../src/store/subscription-write.ts";
import type { MutationCtx } from "./_generated/server";
import { removeConnection, serverMutation } from "./lib/server.ts";
import { billingPeriod, nullable, planId, subscriptionStatus } from "./validators.ts";

// Store.webhooks. A Convex mutation is one transaction: if applying an event
// throws, recording its id is undone too, so the sender's retry is processed.

/** Records the event id; false when it was already recorded. */
async function claimEvent(ctx: MutationCtx, id: string, type: string): Promise<boolean> {
  const seen = await ctx.db
    .query("webhookEvents")
    .withIndex("with_id", (q) => q.eq("id", id))
    .unique();
  if (seen) return false;
  await ctx.db.insert("webhookEvents", { id, type, receivedAt: Date.now() });
  return true;
}

export const applySubscriptionEvent = serverMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    change: nullable(
      v.object({
        dodoSubscriptionId: v.string(),
        status: subscriptionStatus,
        currentPeriodEnd: nullable(v.number()),
        sentAt: v.number(),
        create: v.union(
          v.object({
            userId: v.string(),
            dodoCustomerId: v.string(),
            dodoProductId: v.string(),
            plan: planId,
            period: billingPeriod,
          }),
          v.object({ error: v.string() }),
        ),
      }),
    ),
  },
  handler: async (ctx, { eventId, eventType, change }) => {
    if (!(await claimEvent(ctx, eventId, eventType))) return "duplicate" as const;
    if (!change) return "applied" as const;

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_dodo_id", (q) => q.eq("dodoSubscriptionId", change.dodoSubscriptionId))
      .unique();
    // The shared rule works in Dates; Convex stores epoch milliseconds.
    const write = planSubscriptionWrite(
      existing && { lastEventAt: toDate(existing.lastEventAt) },
      {
        ...change,
        currentPeriodEnd: toDate(change.currentPeriodEnd),
        sentAt: new Date(change.sentAt),
      },
    );
    const now = Date.now();

    if (write.kind === "update" && existing) {
      await ctx.db.patch(existing._id, {
        status: write.values.status,
        currentPeriodEnd: change.currentPeriodEnd,
        lastEventAt: change.sentAt,
        updatedAt: now,
      });
    } else if (write.kind === "create") {
      const values = {
        ...write.values,
        currentPeriodEnd: change.currentPeriodEnd,
        lastEventAt: change.sentAt,
        updatedAt: now,
      };
      // An Account re-subscribing after cancelling already has a row.
      const mine = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", values.userId))
        .unique();
      if (mine) await ctx.db.patch(mine._id, values);
      else await ctx.db.insert("subscriptions", { ...values, id: crypto.randomUUID(), createdAt: now });
    }
    return "applied" as const;
  },
});

export const applyGithubEvent = serverMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    removedInstallation: nullable(v.string()),
  },
  handler: async (ctx, { eventId, eventType, removedInstallation }) => {
    if (!(await claimEvent(ctx, eventId, eventType))) return "duplicate" as const;
    if (removedInstallation !== null) {
      const gone = await ctx.db
        .query("connections")
        .withIndex("by_provider_external", (q) =>
          q.eq("provider", "github").eq("externalId", removedInstallation),
        )
        .collect();
      for (const connection of gone) await removeConnection(ctx.db, connection.id);
    }
    return "applied" as const;
  },
});

function toDate(ms: number | null): Date | null {
  return ms === null ? null : new Date(ms);
}
