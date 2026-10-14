import type { IssueEvent, IssueTriagePatch } from "@ganeshdole/brainbox-shared";

import type { IssueRecord } from "./types.ts";

type TriageFields = Pick<IssueRecord, "status" | "priority" | "closeReason">;

/** What a store writes for one triage change: the new field values, and one
 *  activity event per field that actually changed. */
export interface TriageWrite {
  values: TriageFields & { statusChangedAt?: Date };
  events: Array<{ kind: IssueEvent["kind"]; from: string | null; to: string | null }>;
}

/**
 * Why `patch` can't be applied to an issue in this state, or null when it can.
 * A close reason lives exactly on closed issues: closing needs one, and any
 * other status can't have one. The route answers this with a 400; the stores
 * check it again inside their write, so a race can't slip past.
 */
export function triageError(current: TriageFields, patch: IssueTriagePatch): string | null {
  const status = patch.status ?? current.status;
  if (status !== "closed") {
    return patch.closeReason != null ? "A close reason needs status closed" : null;
  }
  const reason = patch.closeReason !== undefined ? patch.closeReason : current.closeReason;
  return reason == null ? "Closing needs a reason: wont_fix, duplicate, not_reproducible or spam" : null;
}

/**
 * How a store applies a triage patch, decided the same way by every store.
 * Returns null when nothing changes, so a repeated click writes no event.
 * Throws on a patch `triageError` rejects, which rolls back the store's write.
 */
export function planTriageWrite(
  current: TriageFields,
  patch: IssueTriagePatch,
  now: Date,
): TriageWrite | null {
  const error = triageError(current, patch);
  if (error) throw new Error(error);

  const status = patch.status ?? current.status;
  const priority = patch.priority ?? current.priority;
  // leaving closed clears the reason (triageError guarantees one when closed)
  const closeReason = status !== "closed" ? null : (patch.closeReason ?? current.closeReason);

  const events: TriageWrite["events"] = [];
  if (status !== current.status) events.push({ kind: "status", from: current.status, to: status });
  if (closeReason !== current.closeReason) {
    events.push({ kind: "close_reason", from: current.closeReason, to: closeReason });
  }
  if (priority !== current.priority) events.push({ kind: "priority", from: current.priority, to: priority });
  if (events.length === 0) return null;

  return {
    values: {
      status,
      priority,
      closeReason,
      ...(status !== current.status && { statusChangedAt: now }),
    },
    events,
  };
}
