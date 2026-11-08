import type { BillingPeriod, BillingState, PlanId } from "@ganeshdole/brainbox-shared";

/**
 * The plan picker as one state. It used to be four separate values, and the
 * gaps between them were bugs: a failed auto-start fired a second checkout
 * when the period changed, plan buttons stayed live while the auto-start was
 * out, and a failed state lookup was taken for "not paying".
 */
export interface BillingPage {
  load:
    | { kind: "loading"; attempt: number }
    /** The lookup failed. Never read as "no subscription": a paying customer
     *  would be shown the picker, or sent to checkout by a ?plan= link. */
    | { kind: "failed"; attempt: number; error: string }
    | { kind: "ready"; state: BillingState };
  period: BillingPeriod;
  /** The plan the marketing deep link chose, until it has been acted on - or
   *  the person has done anything themselves, which outranks it. Taken at
   *  most once per visit. */
  pendingAuto: PlanId | null;
  checkout:
    | { kind: "idle"; error: string | null }
    /** `auto`: started for the deep link, so the page is a "taking you to
     *  checkout" spinner rather than the picker. */
    | { kind: "starting"; plan: PlanId; auto: boolean };
}

export type BillingAction =
  | { type: "loaded"; state: BillingState }
  | { type: "loadFailed"; error: string }
  | { type: "retry" }
  | { type: "period"; period: BillingPeriod }
  | { type: "start"; plan: PlanId; auto: boolean }
  | { type: "startFailed"; error: string }
  | { type: "skipAuto" };

export function initialBilling(period: BillingPeriod, pendingAuto: PlanId | null): BillingPage {
  return { load: { kind: "loading", attempt: 0 }, period, pendingAuto, checkout: { kind: "idle", error: null } };
}

export function billingReducer(page: BillingPage, action: BillingAction): BillingPage {
  switch (action.type) {
    case "loaded":
      return { ...page, load: { kind: "ready", state: action.state } };
    case "loadFailed":
      if (page.load.kind !== "loading") return page;
      return { ...page, load: { kind: "failed", attempt: page.load.attempt, error: action.error } };
    case "retry":
      if (page.load.kind !== "failed") return page;
      return { ...page, load: { kind: "loading", attempt: page.load.attempt + 1 } };
    case "period":
      return {
        ...page,
        period: action.period,
        pendingAuto: null,
        // the error was about the other period's checkout
        checkout: page.checkout.kind === "idle" ? { kind: "idle", error: null } : page.checkout,
      };
    case "start":
      // one checkout at a time, and choosing by hand ends the auto-start
      if (page.checkout.kind !== "idle") return page;
      return { ...page, pendingAuto: null, checkout: { kind: "starting", plan: action.plan, auto: action.auto } };
    case "startFailed":
      return { ...page, pendingAuto: null, checkout: { kind: "idle", error: action.error } };
    case "skipAuto":
      return { ...page, pendingAuto: null };
  }
}

/** The deep link's checkout, when it should start now: the lookup said they
 *  have no access, and nothing has happened since that rules it out. */
export function autoStartDue(page: BillingPage): { plan: PlanId; period: BillingPeriod } | null {
  if (!page.pendingAuto || page.checkout.kind !== "idle") return null;
  if (page.load.kind !== "ready" || page.load.state.hasAccess) return null;
  return { plan: page.pendingAuto, period: page.period };
}
