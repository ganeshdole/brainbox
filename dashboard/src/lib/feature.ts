import type { Feature, FeatureStatus, Issue } from "@ganeshdole/brainbox-shared";

import { newestFirst } from "./issue";

/** Every status, in the order a feature moves through them. */
export const FEATURE_STATUSES: ReadonlyArray<{ value: FeatureStatus; label: string }> = [
  { value: "under_review", label: "Under review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Declined" },
];

export function statusLabel(status: FeatureStatus): string {
  return FEATURE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** Still to be built or decided: everything but shipped and declined. */
export function isOpen(feature: Pick<Feature, "status">): boolean {
  return feature.status !== "shipped" && feature.status !== "declined";
}

/** The Features page pills: open ones by default, then each status. */
export const FEATURE_FILTERS = [
  { key: "open", label: "Open", match: isOpen },
  { key: "all", label: "All", match: () => true },
  ...FEATURE_STATUSES.map((s) => ({
    key: s.value,
    label: s.label,
    match: (f: Pick<Feature, "status">) => f.status === s.value,
  })),
] as const;

export type FeatureFilterKey = (typeof FEATURE_FILTERS)[number]["key"];

/** Most asked for first; between equals, the one touched last. */
export function byDemand<T extends Pick<Feature, "requestCount" | "updatedAt">>(features: T[]): T[] {
  return [...features].sort(
    (a, b) => b.requestCount - a.requestCount || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Feature requests no feature has taken in yet, newest first. */
export function waitingRequests(issues: Issue[]): Issue[] {
  return newestFirst(issues.filter((i) => i.kind === "feature" && !i.featureId));
}

const TITLE_MAX = 80;

/** A first title for a feature started from a request: the first thing the
 *  end-user said, typed or transcribed. The customer edits it from there. */
export function titleFromRequest(issue: Pick<Issue, "text" | "audio" | "video">): string {
  const said = [issue.text, issue.audio?.transcript, issue.video?.transcript]
    .flatMap((s) => (s ?? "").split("\n"))
    .map((line) => line.trim().replace(/\s+/g, " "))
    .find((line) => line.length > 0);
  if (!said) return "Untitled feature";
  return said.length <= TITLE_MAX ? said : `${said.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}
