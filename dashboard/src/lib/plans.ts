import type { BillingPeriod, PlanId } from "@brainbox-sh/shared";

// The plan catalogue as the picker renders it. Prices are in cents and must
// match both the marketing page (marketing/src/lib/pricing.ts) and the Dodo
// products - Dodo is what actually charges, so if these ever disagree, Dodo
// wins and this is the bug.
export interface PlanOption {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyCents: number;
  annualCents: number;
  ticketsPerMonth: number;
  features: string[];
  featured: boolean;
}

export const PLAN_OPTIONS: readonly PlanOption[] = [
  {
    id: "pro",
    name: "Pro",
    tagline: "For founders and small product teams.",
    monthlyCents: 4_900,
    annualCents: 34_800,
    ticketsPerMonth: 1_000,
    features: [
      "Unlimited projects, seats & pageviews",
      "Voice notes, screen recording & session replay",
      "12 months of history",
    ],
    featured: false,
  },
  {
    id: "business",
    name: "Business",
    tagline: "For teams shipping to a lot of users.",
    monthlyCents: 14_900,
    annualCents: 94_800,
    ticketsPerMonth: 5_000,
    features: [
      "Everything in Pro",
      "Unlimited history",
      "API access & webhooks",
      "Priority support queue",
    ],
    featured: true,
  },
];

/** Charged per ticket beyond the plan's monthly allowance. */
export const OVERAGE_CENTS_PER_TICKET = 5;

/** The per-month figure to show for the selected period. Annual is billed once
 *  a year but quoted monthly so the two columns compare directly. */
export function displayPriceCents(plan: PlanOption, period: BillingPeriod): number {
  return period === "monthly" ? plan.monthlyCents : Math.round(plan.annualCents / 12);
}

export function annualSavingsPercent(plan: PlanOption): number {
  return Math.round((1 - plan.annualCents / (plan.monthlyCents * 12)) * 100);
}

/** `4900` -> `"$49"`, `5` -> `"$0.05"`. Whole dollars lose the trailing `.00`. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
