import { organizationOf, stateCategory, type WorkItemUpdatedEvent } from "@ganeshdole/brainbox-integrations";
import type { IssueTriagePatch, WorkItemStateCategory } from "@ganeshdole/brainbox-shared";

import type { DeliveryRecord, Store, WorkItemUpdateRecord } from "../store/index.ts";
import { authFor, catalogFor } from "./azure-devops.ts";

// Work item changes coming back from Azure DevOps (service hooks): each one
// is matched to the report it was delivered from, recorded once, and moves
// the report's triage status along. Telling the host app is status-webhook.ts.

/** Where a report goes in triage when its work item reaches a state category.
 *  A removed item is closed as won't fix: issues have no "declined". */
const TRIAGE: Record<WorkItemStateCategory, IssueTriagePatch> = {
  Proposed: { status: "open" },
  InProgress: { status: "in_progress" },
  Resolved: { status: "resolved" },
  Completed: { status: "resolved" },
  Removed: { status: "closed", closeReason: "wont_fix" },
};

/**
 * Records one `workitem.updated` event against every report that became this
 * work item, and returns the updates that are new. Events for work items
 * Brainbox didn't create, repeats of a revision already recorded, and
 * changes that are neither a state change nor a comment record nothing.
 */
export async function applyWorkItemEvent(store: Store, event: WorkItemUpdatedEvent): Promise<WorkItemUpdateRecord[]> {
  if (!event.state.old && !event.comment) return [];
  const org = event.organization.toLowerCase();
  const matches = (await store.integrations.deliveriesForExternal("azure-devops", String(event.workItemId))).filter(
    (d) => organizationOf(d.externalUrl ?? undefined)?.toLowerCase() === org,
  );

  const recorded: WorkItemUpdateRecord[] = [];
  for (const delivery of matches) {
    const states = await statesFor(store, delivery, event);
    const category = stateCategory(event.state.new, states) ?? null;
    const previousState = event.state.old ?? event.state.new;
    const update = await store.integrations.recordWorkItemUpdate({
      issueId: delivery.issueId,
      provider: "azure-devops",
      externalId: String(event.workItemId),
      revision: event.revision,
      type: event.type ?? null,
      state: event.state.new,
      reason: event.reason?.new ?? null,
      category,
      previousState,
      previousReason: event.reason?.old ?? event.reason?.new ?? null,
      previousCategory: event.state.old ? (stateCategory(event.state.old, states) ?? null) : category,
      changedByName: event.changedBy?.name ?? null,
      changedByEmail: event.changedBy?.email ?? null,
      changedAt: new Date(event.changedAt),
      comment: event.comment ?? null,
    });
    if (!update) continue;
    // A state Brainbox can't place (a custom one with no category) leaves triage alone.
    if (event.state.old && category) await store.issues.triage([delivery.issueId], TRIAGE[category], null);
    recorded.push(update);
  }
  return recorded;
}

const STATES_TTL_MS = 10 * 60 * 1000;
const statesCache = new Map<string, { at: number; states: Array<{ name: string; category: string }> }>();

/**
 * The work item type's states and their categories, read as the destination's
 * connection and kept for a while. Empty when that can't be done (the
 * destination is gone, or the token no longer works): the categories every
 * process shares stand in.
 */
async function statesFor(
  store: Store,
  delivery: DeliveryRecord,
  event: WorkItemUpdatedEvent,
): Promise<Array<{ name: string; category: string }>> {
  if (!event.type || !delivery.destinationId) return [];
  try {
    const issue = await store.issues.get(delivery.issueId);
    const dest = issue && (await store.integrations.listDestinations(issue.projectId)).find((d) => d.id === delivery.destinationId);
    if (!dest || dest.provider !== "azure-devops") return [];
    const key = `${dest.config.organization}/${dest.config.project.id}/${event.type}`.toLowerCase();
    const cached = statesCache.get(key);
    if (cached && Date.now() - cached.at < STATES_TTL_MS) return cached.states;
    const conn = await store.integrations.getConnection(dest.connectionId);
    if (!conn || conn.status !== "active") return [];
    const states = await catalogFor(await authFor(conn)).workItemStates(
      dest.config.organization,
      dest.config.project.id,
      event.type,
    );
    statesCache.set(key, { at: Date.now(), states });
    return states;
  } catch (err) {
    console.error("[integrations] reading work item states failed:", err);
    return [];
  }
}
