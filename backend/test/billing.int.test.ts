import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { createApp } from "../src/create-app.ts";
import { fromEnv } from "../src/from-env.ts";
import { env } from "../src/env.ts";
import { authCookie, makeProject, makeUser, subscribeUser } from "./helpers.ts";

/** An Account that has never paid - the state this whole file is about. */
function unpaidUser(email?: string) {
  return makeUser(email, { subscribed: false });
}

describe("GET /api/billing/subscription", () => {
  it("requires auth", async () => {
    expect((await app.request("/api/billing/subscription")).status).toBe(401);
  });

  it("reports no subscription and no access for a fresh account", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      subscription: null,
      exempt: false,
      hasAccess: false,
    });
  });

  it("reports access once a subscription is active", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active");
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    const body = (await res.json()) as {
      hasAccess: boolean;
      subscription: { plan: string; ticketsPerPeriod: number; hasAccess: boolean };
    };
    expect(body.hasAccess).toBe(true);
    expect(body.subscription.plan).toBe("pro");
    expect(body.subscription.ticketsPerPeriod).toBe(1_000);
  });

  // An allowance resets per billing cycle, and an annual cycle is a year -
  // which is why the annual Dodo products carry 12x the free threshold.
  // Reporting the monthly number would understate it by a factor of twelve.
  it("reports the annual allowance as 12x the monthly one", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active", { plan: "pro", period: "annual" });
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    const body = (await res.json()) as { subscription: { ticketsPerPeriod: number } };
    expect(body.subscription.ticketsPerPeriod).toBe(12_000);
  });

  it("reports Business annual at 60,000", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active", { plan: "business", period: "annual" });
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    const body = (await res.json()) as { subscription: { ticketsPerPeriod: number } };
    expect(body.subscription.ticketsPerPeriod).toBe(60_000);
  });

  it("leaves the monthly allowance unmultiplied", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active", { plan: "business", period: "monthly" });
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    const body = (await res.json()) as { subscription: { ticketsPerPeriod: number } };
    expect(body.subscription.ticketsPerPeriod).toBe(5_000);
  });

  it.each(["cancelled", "on_hold", "pending"] as const)(
    "does not grant access while %s",
    async (status) => {
      const me = await unpaidUser();
      await subscribeUser(me.id, status);
      const res = await app.request("/api/billing/subscription", {
        headers: { cookie: await authCookie(me.id) },
      });
      const body = (await res.json()) as { hasAccess: boolean };
      expect(body.hasAccess).toBe(false);
    },
  );
});

describe("the paywall", () => {
  it("blocks /api/projects with 402 when unsubscribed", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/projects", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "subscription_required" });
  });

  it("blocks the nested project route too", async () => {
    const me = await unpaidUser();
    const project = await makeProject(me.id);
    const res = await app.request(`/api/projects/${project.id}`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(402);
  });

  it("blocks /api/issues when unsubscribed", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/issues", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(402);
  });

  it("lets a subscriber through", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active");
    const res = await app.request("/api/projects", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
  });

  it("still 401s before it 402s - auth is checked first", async () => {
    expect((await app.request("/api/projects")).status).toBe(401);
  });

  it("leaves /api/me open so the dashboard shell can render unpaid", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/me", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
  });

  it("leaves /api/billing open so the paywall has an exit", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
  });
});

describe("exempt accounts", () => {
  it("gets access with no subscription at all", async () => {
    const me = await unpaidUser("founder@brainbox.test");
    env.BILLING_EXEMPT_EMAILS.push("founder@brainbox.test");
    try {
      const res = await app.request("/api/projects", {
        headers: { cookie: await authCookie(me.id, "founder@brainbox.test") },
      });
      expect(res.status).toBe(200);
    } finally {
      env.BILLING_EXEMPT_EMAILS.pop();
    }
  });

  it("covers everyone while BILLING_DISABLED is on", async () => {
    const me = await unpaidUser("anyone@brainbox.test");
    const deps = fromEnv();
    const free = createApp({ ...deps, billing: { ...deps.billing!, disabled: true } });
    const res = await free.request("/api/projects", {
      headers: { cookie: await authCookie(me.id, "anyone@brainbox.test") },
    });
    expect(res.status).toBe(200);
    const state = await free.request("/api/billing/subscription", {
      headers: { cookie: await authCookie(me.id, "anyone@brainbox.test") },
    });
    expect(await state.json()).toMatchObject({ exempt: true, hasAccess: true });
  });

  it("matches case-insensitively - OAuth casing need not match the env var", async () => {
    const me = await unpaidUser("Mixed@Brainbox.test");
    env.BILLING_EXEMPT_EMAILS.push("mixed@brainbox.test");
    try {
      const res = await app.request("/api/projects", {
        headers: { cookie: await authCookie(me.id, "Mixed@Brainbox.test") },
      });
      expect(res.status).toBe(200);
    } finally {
      env.BILLING_EXEMPT_EMAILS.pop();
    }
  });
});

describe("POST /api/billing/checkout", () => {
  it("requires auth", async () => {
    expect((await app.request("/api/billing/checkout", { method: "POST" })).status).toBe(401);
  });

  it("rejects an unknown plan", async () => {
    const me = await unpaidUser();
    const res = await app.request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ plan: "enterprise", period: "monthly" }),
    });
    expect([400, 503]).toContain(res.status);
  });

  it("refuses to double-bill an active subscriber", async () => {
    const me = await unpaidUser();
    await subscribeUser(me.id, "active");
    const res = await app.request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro", period: "monthly" }),
    });
    // 409 when billing is configured; 503 when it is not (CI has no key).
    expect([409, 503]).toContain(res.status);
  });
});
