import { verifyGithubSignature } from "@ganeshdole/brainbox-integrations";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { Webhook } from "standardwebhooks";
import type { SubscriptionStatus } from "@ganeshdole/brainbox-shared";

import { db } from "../db/client.ts";
import { integrationConnections, subscriptions, webhookEvents } from "../db/schema/index.ts";
import { env } from "../env.ts";
import { planForProductId } from "../lib/dodo.ts";

// Dodo's subscription states -> ours. Anything unmapped is ignored rather than
// guessed at: writing a wrong status here either locks a paying customer out or
// lets a lapsed one stay in.
const STATUS: Record<string, SubscriptionStatus> = {
  active: "active",
  on_hold: "on_hold",
  cancelled: "cancelled",
  canceled: "cancelled",
  expired: "expired",
  pending: "pending",
  failed: "on_hold",
};

interface SubscriptionPayload {
  subscription_id?: string;
  customer?: { customer_id?: string };
  product_id?: string;
  status?: string;
  next_billing_date?: string;
  metadata?: Record<string, string>;
}

export const webhooks = new Hono();

// Public: authenticated by signature, not by session. Mounted before the auth
// gate in app.ts.
webhooks.post("/dodo", async (c) => {
  if (!env.DODO_WEBHOOK_SECRET) {
    // Refusing unverifiable payment events is the only safe default. 500 (not
    // 4xx) so Dodo retries once the secret is configured instead of discarding.
    console.error("[webhooks] DODO_WEBHOOK_SECRET is not set - rejecting");
    return c.json({ error: "Webhooks not configured" }, 500);
  }

  // Signature covers the exact bytes sent, so verify the raw text before any
  // parsing. Re-serialising a parsed object would change the bytes and fail.
  const raw = await c.req.text();
  const headers = {
    "webhook-id": c.req.header("webhook-id") ?? "",
    "webhook-signature": c.req.header("webhook-signature") ?? "",
    "webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
  };

  try {
    new Webhook(env.DODO_WEBHOOK_SECRET).verify(raw, headers);
  } catch (err) {
    console.error("[webhooks] signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(raw) as { type?: string; data?: SubscriptionPayload };
  const type = event.type ?? "";
  const eventId = headers["webhook-id"];
  // Dodo sends unix seconds. Used to order events, not to trust their clock.
  const sentAtSeconds = Number(headers["webhook-timestamp"]);
  const sentAt = Number.isFinite(sentAtSeconds) ? new Date(sentAtSeconds * 1000) : new Date();

  try {
    // Claim and apply in ONE transaction. Claiming first is what makes
    // redelivery a no-op, but if the two were separate a crash between them
    // would leave the id claimed with nothing written - and Dodo's retry would
    // then be skipped as a duplicate, losing the subscription silently. In a
    // transaction, a failure rolls the claim back too, so the retry re-claims.
    const applied = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(webhookEvents)
        .values({ id: eventId, type })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (claimed.length === 0) return false;

      await applySubscriptionEvent(tx, type, event.data ?? {}, sentAt);
      return true;
    });

    return c.json(applied ? { received: true } : { received: true, duplicate: true });
  } catch (err) {
    // 500 so Dodo retries; the transaction has already undone the claim.
    console.error(`[webhooks] failed to apply ${type}:`, err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// GitHub App events. Only an uninstall changes anything: its connections go,
// and their destinations with them.
webhooks.post("/github", async (c) => {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error("[webhooks] GITHUB_WEBHOOK_SECRET is not set - rejecting");
    return c.json({ error: "Webhooks not configured" }, 500);
  }
  const raw = await c.req.text();
  const ok = await verifyGithubSignature(
    raw,
    c.req.header("x-hub-signature-256"),
    env.GITHUB_WEBHOOK_SECRET,
  );
  const deliveryId = c.req.header("x-github-delivery");
  if (!ok || !deliveryId) return c.json({ error: "Invalid signature" }, 400);

  const type = c.req.header("x-github-event") ?? "";
  let payload: { action?: string; installation?: { id?: number } };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const installationId = payload.installation?.id;

  try {
    const applied = await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(webhookEvents)
        .values({ id: `github:${deliveryId}`, type: `${type}.${payload.action ?? ""}` })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      if (claimed.length === 0) return false;

      if (type === "installation" && payload.action === "deleted" && installationId !== undefined) {
        await tx
          .delete(integrationConnections)
          .where(
            and(
              eq(integrationConnections.provider, "github"),
              eq(integrationConnections.externalId, String(installationId)),
            ),
          );
      }
      return true;
    });
    return c.json(applied ? { received: true } : { received: true, duplicate: true });
  } catch (err) {
    console.error(`[webhooks] failed to apply github ${type}:`, err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applySubscriptionEvent(
  db: Tx,
  type: string,
  data: SubscriptionPayload,
  sentAt: Date,
) {
  if (!type.startsWith("subscription.")) return;

  const dodoSubscriptionId = data.subscription_id;
  if (!dodoSubscriptionId) throw new Error("subscription event without subscription_id");

  const status = STATUS[data.status ?? ""];
  if (!status) {
    console.warn(`[webhooks] ignoring ${type} with unmapped status ${data.status}`);
    return;
  }

  const currentPeriodEnd = data.next_billing_date ? new Date(data.next_billing_date) : null;

  // An update to a subscription we already know about: status changes only.
  // Matching on the Dodo id means renewals and cancellations land on the right
  // row even though they carry no session or user context.
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.dodoSubscriptionId, dodoSubscriptionId))
    .limit(1);

  if (existing) {
    // Delivery order is not guaranteed and retries can arrive minutes late, so
    // a stale `cancelled` must not clobber a newer `active`. Compare when the
    // events were SENT, not when they arrived.
    if (existing.lastEventAt && existing.lastEventAt > sentAt) {
      console.warn(
        `[webhooks] ignoring ${type} sent ${sentAt.toISOString()}, older than the ` +
          `state from ${existing.lastEventAt.toISOString()}`,
      );
      return;
    }
    await db
      .update(subscriptions)
      .set({ status, currentPeriodEnd, lastEventAt: sentAt, updatedAt: new Date() })
      .where(eq(subscriptions.dodoSubscriptionId, dodoSubscriptionId));
    return;
  }

  // First time we have seen it - the checkout we started. `metadata.userId` is
  // the only link back to the Account, since the webhook arrives out-of-band
  // with no session.
  const userId = data.metadata?.userId;
  if (!userId) throw new Error(`${type} for unknown subscription and no metadata.userId`);

  const productId = data.product_id ?? "";
  const mapped = planForProductId(productId);
  if (!mapped) throw new Error(`${type} references unconfigured product ${productId}`);

  await db
    .insert(subscriptions)
    .values({
      userId,
      dodoSubscriptionId,
      dodoCustomerId: data.customer?.customer_id ?? "",
      dodoProductId: productId,
      plan: mapped.plan,
      period: mapped.period,
      status,
      currentPeriodEnd,
      lastEventAt: sentAt,
    })
    // An Account re-subscribing after cancelling already has a row; the unique
    // index on user_id would otherwise reject it.
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        dodoSubscriptionId,
        dodoCustomerId: data.customer?.customer_id ?? "",
        dodoProductId: productId,
        plan: mapped.plan,
        period: mapped.period,
        status,
        currentPeriodEnd,
        lastEventAt: sentAt,
        updatedAt: new Date(),
      },
    });
}
