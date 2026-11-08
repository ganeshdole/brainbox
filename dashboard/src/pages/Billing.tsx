import { useEffect, useReducer, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { BillingPeriod, PlanId } from "@ganeshdole/brainbox-shared";

import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { api, isAuthRedirect } from "../lib/api";
import { autoStartDue, billingReducer, initialBilling, type BillingAction } from "../lib/billing";
import { usePageRestore } from "../lib/use-page-restore";
import {
  OVERAGE_CENTS_PER_TICKET,
  PLAN_OPTIONS,
  annualSavingsPercent,
  displayPriceCents,
  formatUsd,
  type PlanOption,
} from "../lib/plans";
import { cn } from "../lib/utils";

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];

function isPeriod(v: string | null): v is BillingPeriod {
  return v === "monthly" || v === "annual";
}

/**
 * Marks a marketing deep-link as already acted on.
 *
 * Auto-starting checkout has one failure mode that matters: Dodo's cancel_url
 * brings the browser back, and if that landed on a URL still carrying ?plan=
 * we would bounce them straight back out to Dodo, trapping them in a loop they
 * cannot escape with the back button. sessionStorage (not state) because the
 * return is a full page load, and per plan+period so a different deep link
 * afterwards still works.
 */
function autoStartKey(plan: string, period: BillingPeriod): string {
  return `brainbox:autoCheckout:${plan}:${period}`;
}

/** Asks for a checkout and leaves for it. Not cancelled by an effect cleanup:
 *  StrictMode's remount would swallow the answer and strand the spinner. Only
 *  a real unmount (`isMounted` false) stops the navigation. */
async function runCheckout(
  dispatch: (action: BillingAction) => void,
  isMounted: () => boolean,
  plan: PlanId,
  period: BillingPeriod,
  auto: boolean,
) {
  dispatch({ type: "start", plan, auto });
  try {
    const { checkoutUrl } = await api.startCheckout(plan, period);
    // Full navigation, not a router push: checkout is Dodo's own page.
    if (isMounted()) window.location.assign(checkoutUrl);
  } catch (e) {
    if (isAuthRedirect(e)) return;
    // Fall back to the plan picker with the reason shown, rather than
    // stranding them on a spinner.
    dispatch({ type: "startFailed", error: e instanceof Error ? e.message : "Could not start checkout" });
  }
}

export function Billing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedPlan = params.get("plan");
  const [page, dispatch] = useReducer(billingReducer, null, () => {
    // Marketing deep-links here as /billing?plan=pro&period=annual. Honouring
    // the period means someone who clicked an annual price sees that same
    // price here rather than the monthly one, which would read as a bait and
    // switch.
    const requested = params.get("period");
    const period: BillingPeriod = isPeriod(requested) ? requested : "annual";
    // The plan they picked on the marketing page, if this is that arrival and
    // we have not already acted on it.
    const plan = PLAN_OPTIONS.find((p) => p.id === requestedPlan);
    let pending: PlanId | null = null;
    try {
      if (plan && !sessionStorage.getItem(autoStartKey(plan.id, period))) pending = plan.id;
    } catch {
      // Storage disabled: skip the auto-start rather than risk the loop.
    }
    return initialBilling(period, pending);
  });
  const { period, checkout } = page;

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Once per visit, whatever re-renders or remounts come after.
  const autoFired = useRef(false);
  // Back from Dodo into the cached page: it was left mid-checkout.
  usePageRestore(() => dispatch({ type: "restored" }));

  const attempt = page.load.kind === "ready" ? null : page.load.attempt;
  useEffect(() => {
    if (attempt === null) return;
    let cancelled = false;
    api
      .getBillingState()
      .then((state) => {
        if (!cancelled) dispatch({ type: "loaded", state });
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) dispatch({ type: "loadFailed", error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // They already chose a plan on the marketing page, and (if they were signed
  // out) just came back through sign-in to get here. Asking them to pick the
  // same plan a second time is the dead end this flow used to have, so take
  // them straight to checkout.
  const due = autoStartDue(page);
  const duePlan = due?.plan;
  const duePeriod = due?.period;
  useEffect(() => {
    if (!duePlan || !duePeriod || autoFired.current) return;
    autoFired.current = true;
    try {
      // Dodo's cancel_url brings the browser back to this same URL; this is
      // what stops it bouncing them straight back out.
      sessionStorage.setItem(autoStartKey(duePlan, duePeriod), "1");
    } catch {
      dispatch({ type: "skipAuto" });
      return;
    }
    void runCheckout(dispatch, () => mounted.current, duePlan, duePeriod, true);
  }, [duePlan, duePeriod]);

  function choose(plan: PlanOption) {
    if (checkout.kind !== "idle") return;
    void runCheckout(dispatch, () => mounted.current, plan.id, period, false);
  }

  const starting = checkout.kind === "starting" ? checkout.plan : null;
  const error = checkout.kind === "idle" ? checkout.error : null;
  const autoPlan = PLAN_OPTIONS.find(
    (p) => p.id === (due?.plan ?? (checkout.kind === "starting" && checkout.auto ? checkout.plan : null)),
  );

  if (page.load.kind === "failed") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="w-full max-w-md text-center">
          <p role="alert" className="text-sm text-error">
            Couldn&rsquo;t check your subscription: {page.load.error}
          </p>
          <Button className="mt-6" variant="secondary" onClick={() => dispatch({ type: "retry" })}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (page.load.kind === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <Spinner />
      </div>
    );
  }

  const state = page.load.state;

  // Checkout is on its way; showing the plan grid underneath would invite a
  // second click on a plan they already chose.
  if (autoPlan && !state.hasAccess) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-sm text-muted">
            Taking you to checkout for {autoPlan.name}&hellip;
          </p>
        </div>
      </div>
    );
  }

  // Already paying (or exempt) and they navigated here anyway - offer the way
  // back rather than inviting a second subscription.
  if (state.hasAccess) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-emphasis">
            {state.exempt ? "Your account is comped" : `You're on ${state.subscription?.plan}`}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {state.exempt
              ? "No subscription needed on this account."
              : "Your subscription is active."}
          </p>
          <Button className="mt-6" onClick={() => navigate("/")}>
            Back to your projects
          </Button>
        </div>
      </div>
    );
  }

  const lapsed = state.subscription && !state.subscription.hasAccess;

  return (
    <div className="min-h-dvh bg-background px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-emphasis">
            {lapsed ? "Your subscription lapsed" : "Choose a plan"}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            {lapsed
              ? `Your subscription is ${state.subscription?.status}. Pick a plan to pick up where you left off - your projects and history are untouched.`
              : "Unlimited projects, seats and pageviews on both plans. You only pay for the tickets you actually get."}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="inline-flex rounded-full border border-default bg-interactive p-1"
          >
            {PERIODS.map((p, i) => (
              <button
                key={p.value}
                role="radio"
                aria-checked={period === p.value}
                // Roving tabindex + arrow keys: a radio group is one tab stop.
                tabIndex={period === p.value ? 0 : -1}
                onKeyDown={(e) => {
                  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
                  e.preventDefault();
                  const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                  const idx = (i + delta + PERIODS.length) % PERIODS.length;
                  const next = PERIODS[idx];
                  if (!next) return;
                  dispatch({ type: "period", period: next.value });
                  const radios =
                    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    );
                  radios?.[idx]?.focus();
                }}
                onClick={() => dispatch({ type: "period", period: p.value })}
                className={cn(
                  "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                  period === p.value
                    ? "bg-brand text-on-brand"
                    : "text-muted hover:text-emphasis",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {PLAN_OPTIONS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border border-default bg-elevated p-6",
                // Highlight what they clicked on the marketing page if there
                // was one, otherwise fall back to the featured plan.
                (requestedPlan ? plan.id === requestedPlan : plan.featured) &&
                  "border-interactive",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-emphasis">{plan.name}</h2>
                {plan.featured && (
                  <span className="rounded-full border border-default px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

              <div className="mt-5 flex items-end gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-emphasis">
                  {formatUsd(displayPriceCents(plan, period))}
                </span>
                <span className="mb-1 text-sm text-muted">/ month</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {period === "annual"
                  ? `${formatUsd(plan.annualCents)} billed yearly · save ${annualSavingsPercent(plan)}%`
                  : "billed monthly"}
              </p>

              <Button
                className="mt-5 w-full"
                variant={plan.featured ? "default" : "secondary"}
                disabled={starting !== null}
                onClick={() => choose(plan)}
              >
                {starting === plan.id ? <Spinner /> : `Choose ${plan.name}`}
              </Button>

              <p className="mt-5 text-xs uppercase tracking-wide text-muted">
                {plan.ticketsPerMonth.toLocaleString("en-US")} tickets / month
              </p>
              <ul className="mt-3 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-default">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-6 text-center text-sm text-error">
            {error}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          60-day money-back guarantee. Over your allowance it&rsquo;s{" "}
          {formatUsd(OVERAGE_CENTS_PER_TICKET)} per extra ticket &mdash; we never drop
          your users&rsquo; feedback to enforce a limit.
        </p>
      </div>
    </div>
  );
}
