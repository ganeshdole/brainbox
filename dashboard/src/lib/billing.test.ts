import { describe, expect, it } from "vitest";
import type { BillingState } from "@ganeshdole/brainbox-shared";

import { autoStartDue, billingReducer, initialBilling, type BillingAction, type BillingPage } from "./billing";

const unpaid: BillingState = { subscription: null, exempt: false, hasAccess: false };
const paying: BillingState = { subscription: null, exempt: true, hasAccess: true };

const run = (page: BillingPage, ...actions: BillingAction[]) => actions.reduce(billingReducer, page);

describe("billing page", () => {
  it("starts the deep link's checkout once the lookup says they aren't paying", () => {
    const page = run(initialBilling("annual", "pro"), { type: "loaded", state: unpaid });
    expect(autoStartDue(page)).toEqual({ plan: "pro", period: "annual" });
  });

  it("never auto-starts for someone already paying", () => {
    const page = run(initialBilling("annual", "pro"), { type: "loaded", state: paying });
    expect(autoStartDue(page)).toBeNull();
  });

  it("never auto-starts off a failed lookup, and offers a retry", () => {
    let page = run(initialBilling("annual", "pro"), { type: "loadFailed", error: "HTTP 500" });
    expect(page.load).toEqual({ kind: "failed", attempt: 0, error: "HTTP 500" });
    expect(autoStartDue(page)).toBeNull();
    page = run(page, { type: "retry" });
    expect(page.load).toEqual({ kind: "loading", attempt: 1 });
    page = run(page, { type: "loaded", state: unpaid });
    expect(autoStartDue(page)?.plan).toBe("pro");
  });

  it("does not auto-start again after the auto-start failed, even on a period change", () => {
    let page = run(
      initialBilling("annual", "pro"),
      { type: "loaded", state: unpaid },
      { type: "start", plan: "pro", auto: true },
    );
    expect(autoStartDue(page)).toBeNull();
    page = run(page, { type: "startFailed", error: "Dodo is down" });
    expect(page.checkout).toEqual({ kind: "idle", error: "Dodo is down" });
    expect(autoStartDue(page)).toBeNull();
    page = run(page, { type: "period", period: "monthly" });
    expect(autoStartDue(page)).toBeNull();
    // and the old error goes with the old period
    expect(page.checkout).toEqual({ kind: "idle", error: null });
  });

  it("lets the person's own choice outrank the deep link", () => {
    const page = run(
      initialBilling("annual", "pro"),
      { type: "period", period: "monthly" },
      { type: "loaded", state: unpaid },
    );
    expect(autoStartDue(page)).toBeNull();
  });

  it("comes back from checkout via Back as the picker, without starting again", () => {
    const page = run(
      initialBilling("annual", "pro"),
      { type: "loaded", state: unpaid },
      { type: "start", plan: "pro", auto: true },
      { type: "restored" },
    );
    expect(page.checkout).toEqual({ kind: "idle", error: null });
    expect(autoStartDue(page)).toBeNull();
  });

  it("starts one checkout at a time", () => {
    const starting = run(
      initialBilling("annual", "pro"),
      { type: "loaded", state: unpaid },
      { type: "start", plan: "pro", auto: true },
    );
    expect(run(starting, { type: "start", plan: "business", auto: false })).toBe(starting);
  });
});
