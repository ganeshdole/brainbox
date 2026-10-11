import { describe, expect, it } from "vitest";
import type { Delivery } from "@brainbox/shared";

import { deliveryLabel, installResult, parseLabels } from "./integrations";

const base: Delivery = {
  id: "d1",
  issueId: "i1",
  provider: "github",
  status: "sent",
  attempts: 1,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

describe("deliveryLabel", () => {
  it("links a sent delivery by issue number", () => {
    expect(
      deliveryLabel({ ...base, externalId: "42", url: "https://github.com/a/b/issues/42" }),
    ).toEqual({ text: "GitHub #42", tone: "ok", href: "https://github.com/a/b/issues/42" });
  });

  it("shows the error for a failed delivery", () => {
    expect(deliveryLabel({ ...base, status: "failed", error: "Not Found" })).toEqual({
      text: "GitHub: Not Found",
      tone: "error",
    });
    expect(deliveryLabel({ ...base, status: "failed" }).text).toBe("GitHub: delivery failed");
  });

  it("marks a pending delivery as in progress", () => {
    expect(deliveryLabel({ ...base, status: "pending" })).toEqual({
      text: "Sending to GitHub…",
      tone: "muted",
    });
  });
});

describe("installResult", () => {
  it("reads only the two values the backend sends", () => {
    expect(installResult(new URLSearchParams("github=connected"))).toBe("connected");
    expect(installResult(new URLSearchParams("github=error"))).toBe("error");
    expect(installResult(new URLSearchParams("github=other"))).toBeNull();
    expect(installResult(new URLSearchParams(""))).toBeNull();
  });
});

describe("parseLabels", () => {
  it("splits, trims, drops empties and duplicates", () => {
    expect(parseLabels(" bug, feedback ,, bug ")).toEqual(["bug", "feedback"]);
    expect(parseLabels("")).toEqual([]);
  });
});
