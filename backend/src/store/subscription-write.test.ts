import { describe, expect, it, vi } from "vitest";

import { planSubscriptionWrite, type CurrentSubscription } from "./subscription-write.ts";
import type { SubscriptionChange } from "./types.ts";

vi.spyOn(console, "warn").mockImplementation(() => {});

const at = (s: number) => new Date(Date.UTC(2026, 10, 1) + s * 1000);
const create = { userId: "u1", dodoCustomerId: "cus", dodoProductId: "pdt_pro", plan: "pro", period: "monthly" } as const;

function change(over: Partial<SubscriptionChange> = {}): SubscriptionChange {
  return { dodoSubscriptionId: "sub_a", status: "active", currentPeriodEnd: null, sentAt: at(10), create, ...over };
}

function row(over: Partial<CurrentSubscription> = {}): CurrentSubscription {
  return { dodoSubscriptionId: "sub_a", status: "active", currentPeriodEnd: at(1000), lastEventAt: at(5), ...over };
}

describe("planSubscriptionWrite", () => {
  it("creates the Account's row from a subscription's first event", () => {
    expect(planSubscriptionWrite(null, change())).toEqual({
      kind: "create",
      values: { ...create, dodoSubscriptionId: "sub_a", status: "active", currentPeriodEnd: null, lastEventAt: at(10) },
    });
  });

  it("refuses a first event it can't tie to an Account", () => {
    expect(() => planSubscriptionWrite(null, change({ create: { error: "no metadata.userId" } }))).toThrow(
      "no metadata.userId",
    );
  });

  it("updates the subscription's own row, keeping the period end an event leaves out", () => {
    const write = planSubscriptionWrite(row(), change({ status: "on_hold" }));
    expect(write).toEqual({
      kind: "update",
      values: { status: "on_hold", currentPeriodEnd: at(1000), lastEventAt: at(10) },
    });
  });

  it("takes a new period end when the event has one", () => {
    const write = planSubscriptionWrite(row(), change({ currentPeriodEnd: at(2000) }));
    expect(write).toMatchObject({ kind: "update", values: { currentPeriodEnd: at(2000) } });
  });

  it("applies a plan change the event carries", () => {
    const product = { dodoProductId: "pdt_biz_annual", plan: "business", period: "annual" } as const;
    const write = planSubscriptionWrite(row(), change({ product }));
    expect(write).toMatchObject({ kind: "update", values: { ...product, status: "active" } });
    // No product (or one we don't sell): the plan is left alone.
    expect(planSubscriptionWrite(row(), change({ product: null }))).toEqual({
      kind: "update",
      values: { status: "active", currentPeriodEnd: at(1000), lastEventAt: at(10) },
    });
  });

  it("ignores an event older than the row's state", () => {
    expect(planSubscriptionWrite(row({ lastEventAt: at(20) }), change({ status: "cancelled" }))).toEqual({ kind: "skip" });
  });

  describe("an event for a subscription other than the Account's current one", () => {
    const current = row({ dodoSubscriptionId: "sub_b", status: "active", lastEventAt: at(5) });

    it("never lets a late ending of the old one lock out the new one", () => {
      // Older than the new subscription's state...
      expect(planSubscriptionWrite(current, change({ status: "cancelled", sentAt: at(1) }))).toEqual({ kind: "skip" });
      // ...or sent after it: the old subscription ending changes nothing.
      expect(planSubscriptionWrite(current, change({ status: "expired", sentAt: at(30) }))).toEqual({ kind: "skip" });
      expect(
        planSubscriptionWrite({ ...current, status: "on_hold" }, change({ status: "cancelled", sentAt: at(30) })),
      ).toEqual({ kind: "skip" });
    });

    it("doesn't let one that isn't paying replace an active one", () => {
      expect(planSubscriptionWrite(current, change({ status: "pending" }))).toEqual({ kind: "skip" });
      expect(planSubscriptionWrite(current, change({ status: "on_hold" }))).toEqual({ kind: "skip" });
    });

    it("takes the row over when it is the Account's new subscription", () => {
      const ended = row({ dodoSubscriptionId: "sub_b", status: "cancelled" });
      expect(planSubscriptionWrite(ended, change({ status: "active" }))).toMatchObject({
        kind: "create",
        values: { dodoSubscriptionId: "sub_a", status: "active", lastEventAt: at(10) },
      });
      expect(planSubscriptionWrite(ended, change({ status: "pending" }))).toMatchObject({
        kind: "create",
        values: { dodoSubscriptionId: "sub_a", status: "pending" },
      });
      expect(planSubscriptionWrite(current, change({ status: "active" }))).toMatchObject({ kind: "create" });
    });
  });
});
