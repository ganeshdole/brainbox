import { createMiddleware } from "hono/factory";

import { billingStateFor, teamHasAccess } from "../lib/billing.ts";
import type { AppEnv } from "../types.ts";

/**
 * The paywall. Runs after verifyAuth(), so a valid session is a given and the
 * only question is whether the Account has paid, or belongs to a Team whose
 * Owner has. Each Team's routes then check that Team (lib/access.ts), so
 * getting past here on one Team's plan opens no other Team.
 *
 * Returns 402 Payment Required rather than 403: the dashboard distinguishes
 * "you cannot do this" from "you have not subscribed yet" and only the latter
 * should redirect to the plan picker.
 *
 * Deliberately NOT applied to:
 *   - /api/billing/*  an unsubscribed Account must be able to reach checkout
 *   - /api/me         the dashboard needs an identity to render the shell
 *   - /ingest         a lapsed Account's users should never have feedback
 *                     silently dropped; we keep accepting and lock the
 *                     dashboard instead.
 */
export const requireSubscription = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.get("authUser").token;
  const uid = token?.sub;
  if (!uid) return c.json({ error: "Unauthorized" }, 401);

  const store = c.get("store");
  const state = await billingStateFor(store, uid, token?.email);
  if (state.hasAccess) return next();
  for (const team of await store.teams.listForUser(uid)) {
    if (await teamHasAccess(store, team.id)) return next();
  }
  return c.json({ error: "Subscription required", code: "subscription_required" }, 402);
});
