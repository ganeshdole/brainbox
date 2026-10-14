import { describe, expect, it } from "vitest";
import type { Feature, Issue } from "@ganeshdole/brainbox-shared";

import { byDemand, FEATURE_FILTERS, isOpen, statusLabel, titleFromRequest, waitingRequests } from "./feature";

const feature = (over: Partial<Feature> & { id: string }): Feature => ({
  projectId: "p1",
  title: "T",
  status: "under_review",
  requestCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const issue = (over: Partial<Issue> & { id: string }): Issue => ({
  projectId: "p1",
  createdAt: "2026-10-01T00:00:00.000Z",
  kind: "feature",
  metadata: {
    url: "https://app.example.com/",
    title: "App",
    viewport: { width: 1, height: 1 },
    devicePixelRatio: 1,
    userAgent: "UA",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
  ...over,
});

describe("byDemand", () => {
  it("puts the most requested first, and the latest touched between equals", () => {
    const sorted = byDemand([
      feature({ id: "a", requestCount: 1 }),
      feature({ id: "b", requestCount: 5 }),
      feature({ id: "c", requestCount: 1, updatedAt: "2026-10-05T00:00:00.000Z" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["b", "c", "a"]);
  });
});

describe("feature filters", () => {
  it("counts shipped and declined as closed, and the default pill shows the open ones", () => {
    expect(isOpen({ status: "planned" })).toBe(true);
    expect(isOpen({ status: "shipped" })).toBe(false);
    expect(isOpen({ status: "declined" })).toBe(false);
    expect(FEATURE_FILTERS[0].key).toBe("open");
    const shipped = FEATURE_FILTERS.find((f) => f.key === "shipped");
    expect(shipped?.match({ status: "shipped" })).toBe(true);
    expect(statusLabel("in_progress")).toBe("In progress");
  });
});

describe("waitingRequests", () => {
  it("keeps only feature requests no feature has taken, newest first", () => {
    const waiting = waitingRequests([
      issue({ id: "old", createdAt: "2026-10-01T00:00:00.000Z" }),
      issue({ id: "new", createdAt: "2026-10-03T00:00:00.000Z" }),
      issue({ id: "taken", featureId: "f1" }),
      issue({ id: "bug", kind: "bug" }),
    ]);
    expect(waiting.map((i) => i.id)).toEqual(["new", "old"]);
  });
});

describe("titleFromRequest", () => {
  it("takes the first line said, typed first, else transcribed", () => {
    expect(titleFromRequest({ text: "\n  Export   to CSV \nfor my accountant" })).toBe("Export to CSV");
    expect(titleFromRequest({ audio: { key: "k", mime: "audio/webm", transcript: "dark mode please" } })).toBe(
      "dark mode please",
    );
    expect(titleFromRequest({})).toBe("Untitled feature");
  });

  it("cuts a long first line at 80 characters", () => {
    const title = titleFromRequest({ text: "a".repeat(120) });
    expect(title).toHaveLength(80);
    expect(title.endsWith("…")).toBe(true);
  });
});
