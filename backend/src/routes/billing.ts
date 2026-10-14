import { Hono } from "hono";
import { z } from "zod";
import type { BillingPeriod, PlanId } from "@ganeshdole/brainbox-shared";

import { billingStateFor, requireBilling } from "../lib/billing.ts";
import { billingConfigured, createCheckoutSession, productIdFor } from "../lib/dodo.ts";
import type { AppEnv } from "../types.ts";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  period: z.enum(["monthly", "annual"]),
});

// Mounted behind verifyAuth() on a deployment with billing, but NOT behind the
// subscription gate - an Account with no subscription has to be able to reach
// checkout, or the paywall would have no exit.
export const billing = new Hono<AppEnv>()
  .get("/subscription", async (c) => {
    const token = c.get("authUser").token;
    const uid = token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    return c.json(await billingStateFor(requireBilling(c), uid, token?.email));
  })

  .post("/checkout", async (c) => {
    const token = c.get("authUser").token;
    const uid = token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);

    const email = typeof token?.email === "string" ? token.email : null;
    if (!email) {
      // Dodo needs an address to bill and to send the receipt to. Every
      // provider we support returns one, so this is a broken-token case.
      return c.json({ error: "Account has no email address" }, 400);
    }

    // Validate and check state before reaching for config, so a malformed or
    // duplicate request gets a meaningful answer rather than a blanket 503.
    const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid plan or period" }, 400);
    }
    const { plan, period } = parsed.data as { plan: PlanId; period: BillingPeriod };

    // Already paying: sending them through checkout again would create a
    // second subscription and bill them twice.
    const billing = requireBilling(c);
    const state = await billingStateFor(billing, uid, email);
    if (state.subscription?.hasAccess) {
      return c.json({ error: "Already subscribed" }, 409);
    }

    if (!billingConfigured(billing.dodo)) {
      return c.json({ error: "Billing is not configured" }, 503);
    }

    try {
      const { dashboardOrigin } = c.get("deps").options;
      const session = await createCheckoutSession(billing.dodo, {
        productId: productIdFor(billing.dodo, plan, period),
        userId: uid,
        email,
        name: typeof token?.name === "string" ? token.name : null,
        // Dodo appends ?subscription_id&status to the return url.
        returnUrl: `${dashboardOrigin}/billing/return`,
        cancelUrl: `${dashboardOrigin}/billing`,
      });
      return c.json({ checkoutUrl: session.checkoutUrl });
    } catch (err) {
      // Never surface the provider error verbatim: it can echo request details.
      console.error("[billing] checkout failed:", err);
      return c.json({ error: "Could not start checkout" }, 502);
    }
  });
