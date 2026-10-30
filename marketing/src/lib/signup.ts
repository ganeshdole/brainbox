// Types come from the local plan catalogue rather than @brainbox/shared, which
// this package deliberately does not depend on - marketing is a static site
// with no contract with the API beyond these two link params.
import type { BillingPeriod, Plan } from "./pricing"

// Where the dashboard lives. Overridable for local work against a dev
// dashboard; defaults to production so a plain `vite build` is always correct.
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? "https://app.brainbox.ganeshdole.com"

/** The dashboard root - for "Sign in", which has no plan attached. */
export function dashboardUrl(): string {
  return DASHBOARD_URL
}

/**
 * Deep link to checkout for one plan.
 *
 * The plan and period ride along as query params so the picker opens
 * pre-selected: a visitor who clicked "Business, annual" should not have to
 * choose it a second time. If they aren't signed in the dashboard sends them
 * through sign-in first and returns them to this exact URL, so the choice
 * survives the round trip and checkout starts on arrival.
 */
export function checkoutUrl(plan: Plan["id"], period: BillingPeriod): string {
  return `${DASHBOARD_URL}/billing?plan=${plan}&period=${period}`
}
