import type { BillingState, PlanId, Subscription, SubscriptionStatus } from "@ganeshdole/brainbox-shared";

import { env } from "../env.ts";
import type { FullStore } from "../store/index.ts";

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
 *  BILLING_DISABLED is on. Case-insensitive: the address from the OAuth
 *  profile need not match the env var's casing. */
export function isExempt(email: string | null | undefined): boolean {
  if (env.BILLING_DISABLED) return true;
  if (!email) return false;
  return env.BILLING_EXEMPT_EMAILS.includes(email.toLowerCase());
}

/**
 * The Account's billing state, and the single authority on whether it may use
 * the product. Routes and middleware consume `hasAccess` rather than
 * re-deriving the rule, so there is one place to change if the policy changes.
 */
export async function billingStateFor(
  store: FullStore,
  userId: string,
  email: string | null | undefined,
): Promise<BillingState> {
  const exempt = isExempt(email);

  const row = await store.billing.subscriptionFor(userId);

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

/**
 * Whether a Team may use the product: when one of its Owners may. The plan
 * stays with the person who pays for it, and covers every Team they own and
 * everyone in those Teams.
 */
export async function teamHasAccess(store: FullStore, teamId: string): Promise<boolean> {
  if (env.BILLING_DISABLED) return true;
  const owners = (await store.teams.members(teamId)).filter((m) => m.role === "owner");
  for (const owner of owners) {
    if ((await billingStateFor(store, owner.userId, owner.email)).hasAccess) return true;
  }
  return false;
}
