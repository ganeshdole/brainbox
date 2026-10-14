import { verifyGithubSignature } from "@ganeshdole/brainbox-integrations";
import { Hono } from "hono";
import { Webhook } from "standardwebhooks";
import type { SubscriptionStatus } from "@ganeshdole/brainbox-shared";

import { planForProductId, type DodoSettings } from "../lib/dodo.ts";
import { requireBilling } from "../lib/billing.ts";
import { requireModule } from "../store/modules.ts";
import type { SubscriptionChange } from "../store/types.ts";
import type { AppEnv } from "../types.ts";

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

// Public: authenticated by signature, not by session. Mounted before the auth
// gate in create-app.ts, each with what it changes: Dodo's with billing, and
// GitHub's with the integrations module.

export const dodoWebhook = new Hono<AppEnv>().post("/dodo", async (c) => {
  const billing = requireBilling(c);
  if (!billing.webhookSecret) {
    // Refusing unverifiable payment events is the only safe default. 500 (not
    // 4xx) so Dodo retries once the secret is configured instead of discarding.
    console.error("[webhooks] the Dodo webhook secret (DODO_WEBHOOK_SECRET) is not set - rejecting");
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
    new Webhook(billing.webhookSecret).verify(raw, headers);
  } catch (err) {
    console.error("[webhooks] signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const event = JSON.parse(raw) as { type?: string; data?: SubscriptionPayload };
  const type = event.type ?? "";
  // Dodo sends unix seconds. Used to order events, not to trust their clock.
  const sentAtSeconds = Number(headers["webhook-timestamp"]);
  const sentAt = Number.isFinite(sentAtSeconds) ? new Date(sentAtSeconds * 1000) : new Date();

  try {
    // The store records the event id and applies the change in one
    // transaction. Recording first is what makes redelivery a no-op; doing
    // both atomically means a failure leaves no record, so Dodo's retry is
    // processed rather than skipped as a duplicate.
    const result = await billing.store.applySubscriptionEvent({
      eventId: headers["webhook-id"],
      eventType: type,
      change: subscriptionChange(billing.dodo, type, event.data ?? {}, sentAt),
    });
    return c.json(result === "applied" ? { received: true } : { received: true, duplicate: true });
  } catch (err) {
    // 500 so Dodo retries; nothing was recorded.
    console.error(`[webhooks] failed to apply ${type}:`, err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

// GitHub App events. Only an uninstall changes anything: its connections go,
// and their destinations with them.
export const githubWebhook = new Hono<AppEnv>().post("/github", async (c) => {
  const secret = c.get("deps").integrations.github?.webhookSecret;
  if (!secret) {
    console.error("[webhooks] the GitHub webhook secret (GITHUB_WEBHOOK_SECRET) is not set - rejecting");
    return c.json({ error: "Webhooks not configured" }, 500);
  }
  const raw = await c.req.text();
  const ok = await verifyGithubSignature(raw, c.req.header("x-hub-signature-256"), secret);
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
  const uninstalled =
    type === "installation" && payload.action === "deleted" && installationId !== undefined;

  try {
    const result = await requireModule(c.get("store"), "integrations").applyGithubEvent({
      eventId: `github:${deliveryId}`,
      eventType: `${type}.${payload.action ?? ""}`,
      removedInstallation: uninstalled ? String(installationId) : null,
    });
    return c.json(result === "applied" ? { received: true } : { received: true, duplicate: true });
  } catch (err) {
    console.error(`[webhooks] failed to apply github ${type}:`, err);
    return c.json({ error: "Processing failed" }, 500);
  }
});

/**
 * What a Dodo event asks the store to change. Null for events that are only
 * recorded: not about a subscription, or a status we do not map. Throws for a
 * subscription event without an id, which the route answers with a 500.
 */
function subscriptionChange(
  dodo: DodoSettings,
  type: string,
  data: SubscriptionPayload,
  sentAt: Date,
): SubscriptionChange | null {
  if (!type.startsWith("subscription.")) return null;

  const dodoSubscriptionId = data.subscription_id;
  if (!dodoSubscriptionId) throw new Error("subscription event without subscription_id");

  const status = STATUS[data.status ?? ""];
  if (!status) {
    console.warn(`[webhooks] ignoring ${type} with unmapped status ${data.status}`);
    return null;
  }

  // Only needed the first time we see this subscription: the checkout we
  // started. `metadata.userId` is the only link back to the Account, since the
  // webhook arrives out-of-band with no session.
  const userId = data.metadata?.userId;
  const productId = data.product_id ?? "";
  const mapped = planForProductId(dodo, productId);
  const create = !userId
    ? { error: `${type} for unknown subscription and no metadata.userId` }
    : !mapped
      ? { error: `${type} references unconfigured product ${productId}` }
      : {
          userId,
          dodoCustomerId: data.customer?.customer_id ?? "",
          dodoProductId: productId,
          plan: mapped.plan,
          period: mapped.period,
        };

  return {
    dodoSubscriptionId,
    status,
    currentPeriodEnd: data.next_billing_date ? new Date(data.next_billing_date) : null,
    sentAt,
    create,
  };
}
