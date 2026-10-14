import { describe, expect, it } from "vitest";

import { organizationOf, parseWorkItemUpdated, stateCategory } from "./events.ts";

/** A `workitem.updated` service hook body, trimmed to what Azure DevOps' sample has. */
function hook(over: { fields?: Record<string, unknown>; current?: Record<string, unknown> } = {}) {
  return {
    id: "notification-1",
    eventType: "workitem.updated",
    publisherId: "tfs",
    resource: {
      id: 5,
      workItemId: 15360,
      rev: 4,
      revisedBy: { displayName: "Jamal Hartnett", uniqueName: "jamal@hapivet.ai" },
      revisedDate: "2026-10-14T09:00:00Z",
      fields: over.fields ?? {
        "System.Rev": { oldValue: 3, newValue: 4 },
        "System.State": { oldValue: "New", newValue: "Active" },
        "System.Reason": { oldValue: "New", newValue: "Approved" },
        "System.History": { newValue: "<div>Looking into it</div>" },
      },
      revision: {
        id: 15360,
        rev: 4,
        fields: {
          "System.WorkItemType": "Bug",
          "System.State": "Active",
          "System.Reason": "Approved",
          ...over.current,
        },
        url: "https://dev.azure.com/hapivetAI/36df3a82/_apis/wit/workItems/15360/revisions/4",
      },
      url: "https://dev.azure.com/hapivetAI/36df3a82/_apis/wit/workItems/15360/updates/5",
    },
    resourceVersion: "1.0",
  };
}

describe("parseWorkItemUpdated", () => {
  it("reads the state change, who made it, when, and the comment", () => {
    expect(parseWorkItemUpdated(hook())).toEqual({
      organization: "hapivetAI",
      workItemId: 15360,
      revision: 4,
      type: "Bug",
      state: { old: "New", new: "Active" },
      reason: { old: "New", new: "Approved" },
      changedBy: { name: "Jamal Hartnett", email: "jamal@hapivet.ai" },
      changedAt: "2026-10-14T09:00:00Z",
      comment: "<div>Looking into it</div>",
    });
  });

  it("gives the current state when only a comment changed", () => {
    const event = parseWorkItemUpdated(
      hook({ fields: { "System.History": { newValue: "Need the clinic's invoice id" } } }),
    );
    expect(event?.state).toEqual({ new: "Active" });
    expect(event?.comment).toBe("Need the clinic's invoice id");
  });

  it("is null for other events and bodies it can't use", () => {
    expect(parseWorkItemUpdated({ ...hook(), eventType: "workitem.created" })).toBeNull();
    expect(parseWorkItemUpdated({ eventType: "workitem.updated", resource: {} })).toBeNull();
    expect(parseWorkItemUpdated("nope")).toBeNull();
  });
});

describe("organizationOf", () => {
  it("finds the organization in every URL shape", () => {
    expect(organizationOf("https://dev.azure.com/hapivetAI/p/_workitems/edit/1")).toBe("hapivetAI");
    expect(organizationOf("https://acme.visualstudio.com/p/_apis/wit/workItems/1")).toBe("acme");
    expect(organizationOf("http://localhost:8790/acme/p/_apis/wit/workItems/1")).toBe("acme");
    expect(organizationOf("not a url")).toBeUndefined();
  });
});

describe("stateCategory", () => {
  it("uses the type's own states, so a custom process maps right", () => {
    const states = [
      { name: "Triage", category: "Proposed" },
      { name: "Shipped", category: "Completed" },
    ];
    expect(stateCategory("Shipped", states)).toBe("Completed");
    expect(stateCategory("triage", states)).toBe("Proposed");
  });

  it("falls back to the names every process shares", () => {
    expect(stateCategory("New")).toBe("Proposed");
    expect(stateCategory("To Do")).toBe("Proposed");
    expect(stateCategory("Active")).toBe("InProgress");
    expect(stateCategory("Committed")).toBe("InProgress");
    expect(stateCategory("Resolved")).toBe("Resolved");
    expect(stateCategory("Closed")).toBe("Completed");
    expect(stateCategory("Done")).toBe("Completed");
    expect(stateCategory("Removed")).toBe("Removed");
    expect(stateCategory("Parked")).toBeUndefined();
  });
});
