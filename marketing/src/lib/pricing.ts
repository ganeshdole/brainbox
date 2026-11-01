// Plan definitions for the pricing section.
//
// Amounts are in cents, matching the Dodo Payments products they mirror - the
// payment provider is the source of truth and it stores minor units, so keeping
// cents here means the page and the checkout can never drift by a rounding.
//
//   Pro      - pdt_0Nk1rAzeNtk84uX31ouXh (monthly) / pdt_0Nk1rCteNVBdisyUN4c1f (annual)
//   Business - pdt_0Nk1rCubHQQcxAyf6aKk6 (monthly) / pdt_0Nk1rCx3uCXnW2ufuSmJy (annual)

export type BillingPeriod = "monthly" | "annual";

export interface Plan {
  id: "pro" | "business";
  name: string;
  tagline: string;
  /** Charged every month on the monthly plan. */
  monthlyCents: number;
  /** Charged once per year on the annual plan. */
  annualCents: number;
  ticketsPerMonth: number;
  features: string[];
  /** The tier the page steers people toward. */
  featured: boolean;
}

export const PRO: Plan = {
  id: "pro",
  name: "Pro",
  tagline: "For founders and small product teams.",
  monthlyCents: 4_900,
  annualCents: 34_800,
  ticketsPerMonth: 1_000,
  features: [
    "Unlimited projects, seats & pageviews",
    "Voice notes, screen recording & session replay",
    "Screenshot with the broken area highlighted",
    "GitHub Issues & Azure DevOps",
    "12 months of history",
  ],
  featured: false,
};

export const BUSINESS: Plan = {
  id: "business",
  name: "Business",
  tagline: "For teams shipping to a lot of users.",
  monthlyCents: 14_900,
  annualCents: 94_800,
  ticketsPerMonth: 5_000,
  features: [
    "Everything in Pro",
    "Unlimited history",
    "Priority support queue",
    "Onboarding call with the founder",
  ],
  featured: true,
};

export const PLANS: readonly Plan[] = [PRO, BUSINESS];

/**
 * Charged per ticket once a plan's monthly allowance is used up.
 *
 * Set so that outgrowing Pro pushes you toward Business rather than parking on
 * overage forever: at 5c, Pro-plus-overage passes Business's $149 at 3,000
 * tickets, comfortably inside Pro's band. At 3c the crossover was 4,333 - past
 * that, Business was only the cheaper option in the last sliver before its own
 * 5,000 cap, so almost nobody would ever have had a reason to upgrade.
 */
export const OVERAGE_CENTS_PER_TICKET = 5;

/**
 * What the annual plan works out to per month. Annual is billed as one payment,
 * but it's quoted per-month so the two columns compare directly.
 */
export function monthlyEquivalentCents(plan: Plan): number {
  return Math.round(plan.annualCents / 12);
}

/** How much cheaper a year of the annual plan is than a year of the monthly one. */
export function annualSavingsPercent(plan: Plan): number {
  const yearOfMonthly = plan.monthlyCents * 12;
  return Math.round((1 - plan.annualCents / yearOfMonthly) * 100);
}

/**
 * The annual saving expressed as "months free", which lands harder than a
 * percentage. Derived rather than written into the copy so it can't go stale
 * when a price moves.
 */
export function annualMonthsFree(plan: Plan): number {
  const saved = plan.monthlyCents * 12 - plan.annualCents;
  // Floor, not round. This is a public claim about money, so it must never
  // overstate: Pro saves 4.9 months and Business 5.6, which rounding would
  // advertise as 5 and 6. Understating is a pleasant surprise; overstating is
  // a complaint.
  return Math.floor(saved / plan.monthlyCents);
}

/**
 * The largest "months free" any plan honestly offers.
 *
 * The badge on the period toggle sits above BOTH cards, so it can only be an
 * "up to" figure - the plans discount at different rates, and quoting Pro's 4
 * there would undersell Business. Each card still states its own exact number.
 */
export function maxAnnualMonthsFree(plans: readonly Plan[] = PLANS): number {
  return plans.reduce((most, plan) => Math.max(most, annualMonthsFree(plan)), 0);
}

/** The headline per-month figure for the period the visitor is looking at. */
export function displayPriceCents(plan: Plan, period: BillingPeriod): number {
  return period === "monthly" ? plan.monthlyCents : monthlyEquivalentCents(plan);
}

/** `4900` -> `"$49"`, `3` -> `"$0.03"`. Whole dollars lose the trailing `.00`. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
