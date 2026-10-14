import type { WorkItemStateCategory } from "@ganeshdole/brainbox-shared";

import { isRecord } from "../github/client.ts";
import { str } from "./client.ts";

/** A work item change, out of an Azure DevOps `workitem.updated` service hook. */
export interface WorkItemUpdatedEvent {
  /** The organization, from the work item's URL. */
  organization: string;
  workItemId: number;
  /** The work item's revision after the change: one per update, so a retry of
   *  the same event has the same one. */
  revision: number;
  type?: string;
  /** `old` is absent when this change didn't touch the state. */
  state: { old?: string; new: string };
  reason?: { old?: string; new?: string };
  changedBy?: { name: string; email?: string };
  changedAt: string;
  /** HTML, as Azure DevOps stores a comment. */
  comment?: string;
}

/**
 * The change in a service hook body, or null for anything that isn't a
 * `workitem.updated` event Brainbox can use.
 */
export function parseWorkItemUpdated(body: unknown): WorkItemUpdatedEvent | null {
  if (!isRecord(body) || body.eventType !== "workitem.updated" || !isRecord(body.resource)) return null;
  const resource = body.resource;
  const revision = isRecord(resource.revision) ? resource.revision : {};
  const current = isRecord(revision.fields) ? revision.fields : {};
  const changed = isRecord(resource.fields) ? resource.fields : {};

  const workItemId = numberOf(resource.workItemId) ?? numberOf(revision.id);
  const rev = numberOf(resource.rev) ?? numberOf(revision.rev);
  const state = str(current["System.State"]) ?? str(newValue(changed["System.State"]));
  const organization = organizationOf(str(resource.url) ?? str(revision.url));
  if (workItemId === undefined || rev === undefined || !state || !organization) return null;

  const oldState = str(oldValue(changed["System.State"]));
  const reasonNew = str(current["System.Reason"]) ?? str(newValue(changed["System.Reason"]));
  const reasonOld = str(oldValue(changed["System.Reason"]));
  const by = isRecord(resource.revisedBy) ? resource.revisedBy : undefined;
  const name = by && (str(by.displayName) ?? str(by.name));
  const email = by && str(by.uniqueName);
  const comment = str(newValue(changed["System.History"]))?.trim();
  return {
    organization,
    workItemId,
    revision: rev,
    ...(str(current["System.WorkItemType"]) && { type: str(current["System.WorkItemType"]) }),
    state: { new: state, ...(oldState && oldState !== state && { old: oldState }) },
    ...((reasonNew || reasonOld) && { reason: { ...(reasonOld && { old: reasonOld }), ...(reasonNew && { new: reasonNew }) } }),
    ...(name && { changedBy: { name, ...(email && email.includes("@") && { email }) } }),
    changedAt:
      str(resource.revisedDate) ?? str(newValue(changed["System.ChangedDate"])) ?? str(current["System.ChangedDate"]) ?? new Date().toISOString(),
    ...(comment && { comment }),
  };
}

/** The organization in a work item URL: `https://dev.azure.com/{org}/...`,
 *  `https://{org}.visualstudio.com/...`, or `{base}/{org}/...` on a server. */
export function organizationOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".visualstudio.com")) return host.slice(0, -".visualstudio.com".length);
  const first = parsed.pathname.split("/").find(Boolean);
  return first ? decodeURIComponent(first) : undefined;
}

/** States every built-in process uses, for when a type's own states can't be read. */
const COMMON: Record<string, WorkItemStateCategory> = {
  new: "Proposed",
  proposed: "Proposed",
  "to do": "Proposed",
  approved: "Proposed",
  active: "InProgress",
  committed: "InProgress",
  "in progress": "InProgress",
  doing: "InProgress",
  resolved: "Resolved",
  closed: "Completed",
  done: "Completed",
  removed: "Removed",
};

const CATEGORIES: readonly string[] = ["Proposed", "InProgress", "Resolved", "Completed", "Removed"] satisfies WorkItemStateCategory[];

function isCategory(value: string | undefined): value is WorkItemStateCategory {
  return value !== undefined && CATEGORIES.includes(value);
}

/**
 * The category `state` belongs to: from the type's own states when known (a
 * custom process names its own), else from the names every process shares.
 */
export function stateCategory(
  state: string,
  states: Array<{ name: string; category: string }> = [],
): WorkItemStateCategory | undefined {
  const own = states.find((s) => s.name.toLowerCase() === state.toLowerCase())?.category;
  return isCategory(own) ? own : COMMON[state.toLowerCase()];
}

function newValue(change: unknown): unknown {
  return isRecord(change) ? change.newValue : undefined;
}

function oldValue(change: unknown): unknown {
  return isRecord(change) ? change.oldValue : undefined;
}

function numberOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
