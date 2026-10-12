import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { stored } from "./harness.ts";
import { testEnv } from "./env.ts";
import { makeUser } from "./helpers.ts";

const signer = new Webhook(testEnv.DODO_WEBHOOK_SECRET!);

let counter = 0;
function nextId() {
  return `msg_${Date.now()}_${counter++}`;
}

/** POST a correctly-signed event, the way Dodo would. `sentAt` lets a test
 *  simulate a delayed retry arriving out of order. */
function send(
  body: unknown,
  opts: { id?: string; signature?: string; sentAt?: Date } = {},
) {
  const payload = JSON.stringify(body);
  const id = opts.id ?? nextId();
  const timestamp = opts.sentAt ?? new Date();
  const signature = opts.signature ?? signer.sign(id, timestamp, payload);

  return app.request("/webhooks/dodo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "webhook-signature": signature,
    },
    body: payload,
  });
}

function subscriptionActive(userId: string, subId: string) {
  return {
    type: "subscription.active",
    data: {
      subscription_id: subId,
      customer: { customer_id: "cus_abc" },
      product_id: testEnv.DODO_PRODUCT_PRO_MONTHLY,
      status: "active",
      next_billing_date: "2026-09-01T00:00:00Z",
      metadata: { userId },
    },
  };
}

describe("POST /webhooks/dodo - signature", () => {
  it("rejects a forged signature", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const res = await send(subscriptionActive(me.id, "sub_forged"), {
      signature: "v1,YmFkc2lnbmF0dXJl",
    });
    expect(res.status).toBe(400);

    const rows = await stored.subscriptions(me.id);
    expect(rows).toHaveLength(0);
  });

  it("rejects a payload whose body was altered after signing", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const id = nextId();
    const timestamp = new Date();
    const signed = JSON.stringify(subscriptionActive(me.id, "sub_tamper"));
    const signature = signer.sign(id, timestamp, signed);

    // Same signature, different bytes - a downgrade attempt.
    const tampered = signed.replace("pro_monthly", "business_annual");
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
        "webhook-signature": signature,
      },
      body: tampered,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unsigned request outright", async () => {
    const res = await app.request("/webhooks/dodo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "subscription.active" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /webhooks/dodo - subscription lifecycle", () => {
  it("creates the subscription and grants access", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const res = await send(subscriptionActive(me.id, "sub_new"));
    expect(res.status).toBe(200);

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("active");
    expect(row?.plan).toBe("pro");
    expect(row?.period).toBe("monthly");
    expect(row?.dodoSubscriptionId).toBe("sub_new");
    expect(row?.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("maps the annual product to the annual period", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const event = subscriptionActive(me.id, "sub_annual");
    event.data.product_id = testEnv.DODO_PRODUCT_BUSINESS_ANNUAL!;
    await send(event);

    const [row] = await stored.subscriptions(me.id);
    expect(row?.plan).toBe("business");
    expect(row?.period).toBe("annual");
  });

  it("revokes access when the subscription is cancelled", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    await send(subscriptionActive(me.id, "sub_cancel"));

    await send({
      type: "subscription.cancelled",
      data: { subscription_id: "sub_cancel", status: "cancelled" },
    });

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("cancelled");
  });

  it("suspends access while a payment is on hold", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    await send(subscriptionActive(me.id, "sub_hold"));
    await send({
      type: "subscription.on_hold",
      data: { subscription_id: "sub_hold", status: "on_hold" },
    });

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("on_hold");
  });

  it("lets a cancelled account resubscribe without violating the one-per-account rule", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    await send(subscriptionActive(me.id, "sub_first"));
    await send({
      type: "subscription.cancelled",
      data: { subscription_id: "sub_first", status: "cancelled" },
    });

    const again = subscriptionActive(me.id, "sub_second");
    const res = await send(again);
    expect(res.status).toBe(200);

    const rows = await stored.subscriptions(me.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.dodoSubscriptionId).toBe("sub_second");
  });
});

describe("POST /webhooks/dodo - out-of-order delivery", () => {
  // Dodo retries on its own schedule, so a cancellation sent before a renewal
  // can arrive after it. Applying blindly would revoke a paying customer.
  it("ignores a stale cancellation that arrives after a newer activation", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    // Inside the Standard Webhooks replay window (~5 min) - anything older is
    // rejected at the signature layer before our ordering guard is reached, so
    // this window is exactly where reordering can actually bite.
    const old = new Date(Date.now() - 2 * 60_000);

    await send(subscriptionActive(me.id, "sub_race"));
    const res = await send(
      {
        type: "subscription.cancelled",
        data: { subscription_id: "sub_race", status: "cancelled" },
      },
      { sentAt: old },
    );
    expect(res.status).toBe(200);

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("active");
  });

  it("still applies an event sent after the current state", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    await send(subscriptionActive(me.id, "sub_ordered"));
    await send(
      {
        type: "subscription.cancelled",
        data: { subscription_id: "sub_ordered", status: "cancelled" },
      },
      { sentAt: new Date(Date.now() + 60_000) },
    );

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("cancelled");
  });
});

describe("POST /webhooks/dodo - idempotency", () => {
  it("processes a redelivered event only once", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const id = nextId();
    const event = subscriptionActive(me.id, "sub_dupe");

    const first = await send(event, { id });
    expect(await first.json()).toMatchObject({ received: true });

    const second = await send(event, { id });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    const rows = await stored.subscriptions(me.id);
    expect(rows).toHaveLength(1);
  });

  it("records the event id so the dedupe survives a restart", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    const id = nextId();
    await send(subscriptionActive(me.id, "sub_recorded"), { id });

    const [row] = await stored.webhookEvents(id);
    expect(row?.type).toBe("subscription.active");
  });

  it("releases the event id when processing fails, so the retry is not swallowed", async () => {
    const id = nextId();
    // No metadata.userId and an unknown subscription: unprocessable.
    const res = await send(
      {
        type: "subscription.active",
        data: { subscription_id: "sub_orphan", status: "active" },
      },
      { id },
    );
    expect(res.status).toBe(500);

    const rows = await stored.webhookEvents(id);
    expect(rows).toHaveLength(0);
  });
});

describe("POST /webhooks/dodo - unknown input", () => {
  it("ignores an unmapped status rather than guessing", async () => {
    const me = await makeUser(undefined, { subscribed: false });
    await send(subscriptionActive(me.id, "sub_weird"));

    const res = await send({
      type: "subscription.updated",
      data: { subscription_id: "sub_weird", status: "something_new" },
    });
    expect(res.status).toBe(200);

    const [row] = await stored.subscriptions(me.id);
    expect(row?.status).toBe("active");
  });

  it("acknowledges non-subscription events without touching anything", async () => {
    const res = await send({
      type: "payment.succeeded",
      data: { payment_id: "pay_1" },
    });
    expect(res.status).toBe(200);
  });
});
