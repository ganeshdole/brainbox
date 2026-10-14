import { describe, expect, it } from "vitest";
import type { Delivery } from "@ganeshdole/brainbox-shared";

import {
  bugVisibilityWarning,
  defaultBugType,
  defaultFeatureType,
  deliveryLabel,
  installResult,
  parseLabels,
} from "./integrations";

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

  it("names Azure DevOps work items by id", () => {
    expect(
      deliveryLabel({ ...base, provider: "azure-devops", externalId: "4821", url: "https://dev.azure.com/a/p/_workitems/edit/4821" }),
    ).toEqual({ text: "Azure DevOps #4821", tone: "ok", href: "https://dev.azure.com/a/p/_workitems/edit/4821" });
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

describe("Azure DevOps defaults", () => {
  const types = (...names: string[]) => names.map((name) => ({ name }));

  it("files bugs as Bug, else Issue, else the first type", () => {
    expect(defaultBugType(types("Epic", "Bug", "Issue"))).toBe("Bug");
    expect(defaultBugType(types("Epic", "Issue", "Task"))).toBe("Issue");
    expect(defaultBugType(types("Epic"))).toBe("Epic");
    expect(defaultBugType([])).toBe("");
  });

  it("files feature requests as the process's backlog item", () => {
    expect(defaultFeatureType(types("Bug", "User Story"))).toBe("User Story");
    expect(defaultFeatureType(types("Bug", "Product Backlog Item"))).toBe("Product Backlog Item");
    expect(defaultFeatureType(types("Bug", "Requirement"))).toBe("Requirement");
    expect(defaultFeatureType(types("Task", "Bug"))).toBe("Bug");
  });
});

describe("bugVisibilityWarning", () => {
  it("warns when a Bug would land on no board", () => {
    expect(bugVisibilityWarning("Bug", "asTasks", "backlog")).toMatch(/taskboard only/);
    expect(bugVisibilityWarning("Bug", "off", "current")).toMatch(/doesn't show Bugs/);
  });

  it("stays quiet when the Bug will show, or for other types", () => {
    expect(bugVisibilityWarning("Bug", "asTasks", "current")).toBeNull();
    expect(bugVisibilityWarning("Bug", "asRequirements", "backlog")).toBeNull();
    expect(bugVisibilityWarning("User Story", "off", "backlog")).toBeNull();
  });
});

describe("parseLabels", () => {
  it("splits, trims, drops empties and duplicates", () => {
    expect(parseLabels(" bug, feedback ,, bug ")).toEqual(["bug", "feedback"]);
    expect(parseLabels("")).toEqual([]);
  });
});
