import { describe, expect, it } from "vitest"

import { checkoutUrl, dashboardUrl } from "./signup"

// VITE_DASHBOARD_URL is unset under test, so these assert the production
// default - which is the value a plain `vite build` ships.
const DASHBOARD = "https://app.brainbox.ganeshdole.com"

describe("dashboardUrl", () => {
  it("points at the dashboard root", () => {
    expect(dashboardUrl()).toBe(DASHBOARD)
  })
})

describe("checkoutUrl", () => {
  it("carries the plan and period so the picker opens pre-selected", () => {
    expect(checkoutUrl("pro", "annual")).toBe(`${DASHBOARD}/billing?plan=pro&period=annual`)
    expect(checkoutUrl("business", "monthly")).toBe(
      `${DASHBOARD}/billing?plan=business&period=monthly`,
    )
  })

  it("covers every plan/period pair the pricing table can produce", () => {
    for (const plan of ["pro", "business"] as const) {
      for (const period of ["monthly", "annual"] as const) {
        const url = new URL(checkoutUrl(plan, period))
        expect(url.pathname).toBe("/billing")
        expect(url.searchParams.get("plan")).toBe(plan)
        expect(url.searchParams.get("period")).toBe(period)
      }
    }
  })

  it("produces params the dashboard can round-trip through sign-in", () => {
    // The dashboard bounces an anonymous visitor to /login and returns them
    // here, so the query has to survive being read back off a URL.
    const url = new URL(checkoutUrl("business", "annual"))
    expect(`${url.pathname}${url.search}`).toBe("/billing?plan=business&period=annual")
  })
})
