import type {
  Issue,
  IssueCloseReason,
  IssueEvent,
  IssuePriority,
  IssueStatus,
  IssueTriagePatch,
} from "@ganeshdole/brainbox-shared";

/** Every status in workflow order, with how the dashboard names and colours it. */
export const STATUSES: ReadonlyArray<{ value: IssueStatus; label: string; dot: string }> = [
  { value: "new", label: "New", dot: "bg-blue-9" },
  { value: "open", label: "Open", dot: "bg-gray-9" },
  { value: "in_progress", label: "In progress", dot: "bg-yellow-9" },
  { value: "resolved", label: "Resolved", dot: "bg-green-9" },
  { value: "closed", label: "Closed", dot: "bg-gray-7" },
];

/** Most urgent first, so a menu reads top-down by importance. */
export const PRIORITIES: ReadonlyArray<{ value: IssuePriority; label: string }> = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
];

export const CLOSE_REASONS: ReadonlyArray<{ value: IssueCloseReason; label: string }> = [
  { value: "wont_fix", label: "Won't fix" },
  { value: "duplicate", label: "Duplicate" },
  { value: "not_reproducible", label: "Can't reproduce" },
  { value: "spam", label: "Spam" },
];

export const statusLabel = (s: IssueStatus): string => STATUSES.find((o) => o.value === s)?.label ?? s;
export const priorityLabel = (p: IssuePriority): string => PRIORITIES.find((o) => o.value === p)?.label ?? p;
export const closeReasonLabel = (r: IssueCloseReason): string =>
  CLOSE_REASONS.find((o) => o.value === r)?.label ?? r;

/** The Reports page's triage views. Inbox is what nobody has looked at yet;
 *  Done holds both outcomes, fixed and not acted on. */
export const TRIAGE_TABS = [
  { key: "inbox", label: "Inbox", match: (i: Issue) => i.status === "new" },
  { key: "open", label: "Open", match: (i: Issue) => i.status === "open" || i.status === "in_progress" },
  { key: "done", label: "Done", match: (i: Issue) => i.status === "resolved" || i.status === "closed" },
  { key: "all", label: "All", match: () => true },
] as const;

export type TriageTabKey = (typeof TRIAGE_TABS)[number]["key"];

/** Where the Reports page opens: the inbox when there's something in it,
 *  otherwise the open work. */
export function defaultTab(issues: readonly Issue[]): TriageTabKey {
  return issues.some((i) => i.status === "new") ? "inbox" : "open";
}

const RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Most urgent first; newest first within a priority. Doesn't mutate. */
export function byPriority<T extends Pick<Issue, "priority" | "createdAt">>(issues: readonly T[]): T[] {
  return [...issues].sort(
    (a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.localeCompare(a.createdAt),
  );
}

/** The issue as it will be once the server applies `patch`, for updating the
 *  screen before the response arrives. Mirrors the backend's rule: a close
 *  reason only survives on a closed issue. */
export function applyTriage(issue: Issue, patch: IssueTriagePatch): Issue {
  const status = patch.status ?? issue.status;
  const closeReason =
    status !== "closed" ? undefined : patch.closeReason !== undefined ? (patch.closeReason ?? undefined) : issue.closeReason;
  return { ...issue, status, priority: patch.priority ?? issue.priority, closeReason };
}

/** One activity line, e.g. "Ada changed status from New to Resolved" or
 *  "Ada set the close reason to Duplicate". */
export function describeEvent(event: IssueEvent): string {
  const who = event.actor ? (event.actor.name ?? "Someone") : "Brainbox";
  if (event.kind === "close_reason") {
    const reason = (v: string) => closeReasonLabel(v as IssueCloseReason);
    if (event.to === null) return `${who} cleared the close reason`;
    if (event.from === null) return `${who} set the close reason to ${reason(event.to)}`;
    return `${who} changed the close reason from ${reason(event.from)} to ${reason(event.to)}`;
  }
  const label = (v: string | null) =>
    v === null ? "none" : event.kind === "status" ? statusLabel(v as IssueStatus) : priorityLabel(v as IssuePriority);
  return `${who} changed ${event.kind} from ${label(event.from)} to ${label(event.to)}`;
}
