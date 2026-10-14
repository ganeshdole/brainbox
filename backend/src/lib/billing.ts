import type { BillingState, PlanId, Subscription, SubscriptionStatus } from "@ganeshdole/brainbox-shared";

import type { Context } from "hono";

import type { Deps, ResolvedBilling } from "../deps.ts";
import type { AppEnv } from "../types.ts";

// Tickets included per billing cycle, before overage. Mirrors the marketing
// page's `lib/pricing.ts`; both ultimately mirror the free_threshold on the
// Dodo products, which is what actually bills.
//
// Note this is the MONTHLY allowance. Annual products carry 12x on Dodo
// because a free threshold resets per billing cycle, and theirs is a year.
export const TICKETS_PER_MONTH: Record<PlanId, number> = {
  pro: 1_000,
  business: 5_000,
};

/** The only statuses that grant access. Everything else - on_hold after a
 *  failed payment, cancelled, expired, or pending a first charge - does not. */
function grantsAccess(status: SubscriptionStatus): boolean {
  return status === "active";
}

/** Accounts allowed past the paywall without paying: ours, or everyone while
 *  billing is disabled. Case-insensitive: the address from the OAuth profile
 *  need not match the setting's casing. */
export function isExempt(billing: ResolvedBilling, email: string | null | undefined): boolean {
  if (billing.disabled) return true;
  if (!email) return false;
  return billing.exemptEmails.includes(email.toLowerCase());
}

/**
 * The Account's billing state, and the single authority on whether it may use
 * the product. Routes and middleware consume `hasAccess` rather than
 * re-deriving the rule, so there is one place to change if the policy changes.
 */
export async function billingStateFor(
  billing: ResolvedBilling,
  userId: string,
  email: string | null | undefined,
): Promise<BillingState> {
  const exempt = isExempt(billing, email);

  const row = await billing.store.subscriptionFor(userId);

  if (!row) return { subscription: null, exempt, hasAccess: exempt };

  // An allowance resets per BILLING cycle, and an annual plan's cycle is a
  // year - which is why the annual products carry 12x the monthly threshold on
  // Dodo. Reporting the monthly figure here would tell an annual subscriber
  // they had 1,000 tickets when Dodo will not charge them until 12,000.
  const subscription: Subscription = {
    plan: row.plan,
    period: row.period,
    status: row.status,
    ticketsPerPeriod: TICKETS_PER_MONTH[row.plan] * (row.period === "annual" ? 12 : 1),
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    hasAccess: grantsAccess(row.status),
  };

  return {
    subscription,
    exempt,
    hasAccess: subscription.hasAccess || exempt,
  };
}

/** Whether the Account may use the product. Always, on a deployment
 *  without billing. */
export async function userHasAccess(
  deps: Deps,
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!deps.billing) return true;
  return (await billingStateFor(deps.billing, userId, email)).hasAccess;
}

/**
 * Whether a Team may use the product: when one of its Owners may. The plan
 * stays with the person who pays for it, and covers every Team they own and
 * everyone in those Teams. Always, without billing; and without Teams, the
 * paywall in front of the dashboard API is the only one.
 */
export async function teamHasAccess(deps: Deps, teamId: string): Promise<boolean> {
  const { billing, store } = deps;
  if (!billing || billing.disabled || !store.teams) return true;
  const owners = (await store.teams.members(teamId)).filter((m) => m.role === "owner");
  for (const owner of owners) {
    if ((await billingStateFor(billing, owner.userId, owner.email)).hasAccess) return true;
  }
  return false;
}

/** Billing, for a route mounted only on a deployment with it. */
export function requireBilling(c: Context<AppEnv>): ResolvedBilling {
  const { billing } = c.get("deps");
  if (!billing) throw new Error("This app has no billing");
  return billing;
}
