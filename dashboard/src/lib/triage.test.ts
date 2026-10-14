import { describe, expect, it } from "vitest";
import type { Issue, IssueEvent } from "@ganeshdole/brainbox-shared";

import { applyTriage, byPriority, defaultTab, describeEvent, TRIAGE_TABS } from "./triage";

const issue = (over: Partial<Issue> & { id: string }): Issue => ({
  projectId: "p1",
  createdAt: "2026-10-01T10:00:00.000Z",
  kind: "bug",
  status: "new",
  priority: "none",
  metadata: {
    url: "https://app.test/",
    title: "App",
    viewport: { width: 1, height: 1 },
    devicePixelRatio: 1,
    userAgent: "x",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
  ...over,
});

describe("TRIAGE_TABS", () => {
  const issues = [
    issue({ id: "n", status: "new" }),
    issue({ id: "o", status: "open" }),
    issue({ id: "p", status: "in_progress" }),
    issue({ id: "r", status: "resolved" }),
    issue({ id: "c", status: "closed" }),
  ];
  const tab = (key: string) => {
    const t = TRIAGE_TABS.find((x) => x.key === key)!;
    return issues.filter(t.match).map((i) => i.id);
  };

  it("splits issues into inbox, open work and done", () => {
    expect(tab("inbox")).toEqual(["n"]);
    expect(tab("open")).toEqual(["o", "p"]);
    expect(tab("done")).toEqual(["r", "c"]);
    expect(tab("all")).toEqual(["n", "o", "p", "r", "c"]);
  });
});

describe("defaultTab", () => {
  it("opens the inbox when something is in it, otherwise open work", () => {
    expect(defaultTab([issue({ id: "1", status: "open" }), issue({ id: "2", status: "new" })])).toBe("inbox");
    expect(defaultTab([issue({ id: "1", status: "open" })])).toBe("open");
    expect(defaultTab([])).toBe("open");
  });
});

describe("byPriority", () => {
  it("puts urgent first and no priority last, newest first within a priority", () => {
    const sorted = byPriority([
      issue({ id: "none", priority: "none" }),
      issue({ id: "low", priority: "low" }),
      issue({ id: "high-old", priority: "high", createdAt: "2026-10-01T09:00:00.000Z" }),
      issue({ id: "urgent", priority: "urgent" }),
      issue({ id: "high-new", priority: "high", createdAt: "2026-10-02T09:00:00.000Z" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["urgent", "high-new", "high-old", "low", "none"]);
  });
});

describe("applyTriage", () => {
  it("applies status and priority", () => {
    const next = applyTriage(issue({ id: "1" }), { status: "in_progress", priority: "high" });
    expect(next.status).toBe("in_progress");
    expect(next.priority).toBe("high");
  });

  it("keeps a close reason only on a closed issue", () => {
    const closed = applyTriage(issue({ id: "1" }), { status: "closed", closeReason: "spam" });
    expect(closed.closeReason).toBe("spam");
    expect(applyTriage(closed, { priority: "low" }).closeReason).toBe("spam");
    expect(applyTriage(closed, { status: "open" }).closeReason).toBeUndefined();
  });
});

describe("describeEvent", () => {
  const event: IssueEvent = {
    id: "e",
    issueId: "1",
    kind: "status",
    from: "new",
    to: "resolved",
    actor: { id: "u", name: "Ada" },
    createdAt: "2026-10-01T10:00:00.000Z",
  };

  it("names who changed what, with readable values", () => {
    expect(describeEvent(event)).toBe("Ada changed status from New to Resolved");
    expect(describeEvent({ ...event, kind: "priority", from: "none", to: "urgent" })).toBe(
      "Ada changed priority from No priority to Urgent",
    );
  });

  it("describes setting, changing and clearing a close reason", () => {
    const reason = { ...event, kind: "close_reason" as const };
    expect(describeEvent({ ...reason, from: null, to: "duplicate" })).toBe("Ada set the close reason to Duplicate");
    expect(describeEvent({ ...reason, from: "wont_fix", to: "spam" })).toBe(
      "Ada changed the close reason from Won't fix to Spam",
    );
    expect(describeEvent({ ...reason, from: "spam", to: null })).toBe("Ada cleared the close reason");
  });

  it("credits system changes to Brainbox", () => {
    const system: IssueEvent = { ...event };
    delete system.actor;
    expect(describeEvent(system)).toBe("Brainbox changed status from New to Resolved");
  });
});
