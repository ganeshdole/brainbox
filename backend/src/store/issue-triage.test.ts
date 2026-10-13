import { describe, expect, it } from "vitest";

import { planTriageWrite, triageError } from "./issue-triage.ts";

const now = new Date("2026-10-13T12:00:00Z");
const fresh = { status: "new", priority: "none", closeReason: null } as const;
const closed = { status: "closed", priority: "none", closeReason: "wont_fix" } as const;

describe("triageError", () => {
  it("accepts ordinary status and priority changes", () => {
    expect(triageError(fresh, { status: "open", priority: "high" })).toBeNull();
  });

  it("requires a reason to close", () => {
    expect(triageError(fresh, { status: "closed" })).toMatch(/needs a reason/);
    expect(triageError(fresh, { status: "closed", closeReason: null })).toMatch(/needs a reason/);
    expect(triageError(fresh, { status: "closed", closeReason: "spam" })).toBeNull();
  });

  it("keeps an already closed issue's reason when the patch doesn't touch it", () => {
    expect(triageError(closed, { priority: "low" })).toBeNull();
    expect(triageError(closed, { status: "closed" })).toBeNull();
  });

  it("won't clear the reason of an issue that stays closed", () => {
    expect(triageError(closed, { closeReason: null })).toMatch(/needs a reason/);
  });

  it("rejects a reason for any status but closed", () => {
    expect(triageError(fresh, { closeReason: "spam" })).toMatch(/needs status closed/);
    expect(triageError(closed, { status: "resolved", closeReason: "spam" })).toMatch(/needs status closed/);
  });
});

describe("planTriageWrite", () => {
  it("writes the new status with an event and stamps when it changed", () => {
    expect(planTriageWrite(fresh, { status: "open" }, now)).toEqual({
      values: { status: "open", priority: "none", closeReason: null, statusChangedAt: now },
      events: [{ kind: "status", from: "new", to: "open" }],
    });
  });

  it("logs one event per changed field", () => {
    const write = planTriageWrite(fresh, { status: "in_progress", priority: "high" }, now);
    expect(write?.events).toEqual([
      { kind: "status", from: "new", to: "in_progress" },
      { kind: "priority", from: "none", to: "high" },
    ]);
  });

  it("leaves statusChangedAt alone when only the priority changes", () => {
    const write = planTriageWrite(fresh, { priority: "urgent" }, now);
    expect(write?.values).not.toHaveProperty("statusChangedAt");
  });

  it("returns null when nothing changes", () => {
    expect(planTriageWrite(fresh, { status: "new", priority: "none" }, now)).toBeNull();
    expect(planTriageWrite(fresh, {}, now)).toBeNull();
    expect(planTriageWrite(closed, { closeReason: "wont_fix" }, now)).toBeNull();
  });

  it("logs the reason along with closing", () => {
    const write = planTriageWrite(fresh, { status: "closed", closeReason: "duplicate" }, now);
    expect(write?.values.closeReason).toBe("duplicate");
    expect(write?.events).toEqual([
      { kind: "status", from: "new", to: "closed" },
      { kind: "close_reason", from: null, to: "duplicate" },
    ]);
  });

  it("logs a changed reason on an issue that stays closed", () => {
    expect(planTriageWrite(closed, { closeReason: "spam" }, now)).toEqual({
      values: { status: "closed", priority: "none", closeReason: "spam" },
      events: [{ kind: "close_reason", from: "wont_fix", to: "spam" }],
    });
  });

  it("clears and logs the reason when an issue leaves closed", () => {
    const write = planTriageWrite(closed, { status: "open" }, now);
    expect(write?.values.closeReason).toBeNull();
    expect(write?.events).toContainEqual({ kind: "close_reason", from: "wont_fix", to: null });
  });

  it("throws on a patch triageError rejects", () => {
    expect(() => planTriageWrite(fresh, { status: "closed" }, now)).toThrow(/needs a reason/);
  });
});
