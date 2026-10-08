import type { Issue } from "@brainbox/shared";

/** One-line label for a report: the end-user's note if they wrote one, else
 *  the page's document title. The bare host+path is a last resort - inside a
 *  project the domain is constant context, not a title. */
export function issueTitle(issue: Pick<Issue, "text" | "metadata">): string {
  const text = issue.text?.trim();
  if (text) return text;
  return issue.metadata.title || pageLabel(issue.metadata.url) || "Untitled report";
}

/** The Reports-page filter pills: what each report carries. */
export const REPORT_FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "replay", label: "Replays", match: (i: Issue) => Boolean(i.session) },
  { key: "video", label: "Recordings", match: (i: Issue) => Boolean(i.video) },
  { key: "errors", label: "With errors", match: (i: Issue) => i.metadata.consoleErrors.length > 0 },
] as const;

export type ReportFilterKey = (typeof REPORT_FILTERS)[number]["key"];

/** The full list pipeline: project untick (all view) → type filter → search. */
export function visibleReports(
  issues: Issue[],
  opts: { filter: ReportFilterKey; query: string; hiddenProjects?: ReadonlySet<string> },
): Issue[] {
  const active = REPORT_FILTERS.find((f) => f.key === opts.filter) ?? REPORT_FILTERS[0];
  return issues
    .filter((i) => !opts.hiddenProjects?.has(i.projectId))
    .filter(active.match)
    .filter((i) => matchesIssue(i, opts.query));
}

/** Newest first by createdAt (ISO strings compare lexically). Needed when
 *  merging per-project lists in the all-projects view. */
export function newestFirst<T extends Pick<Issue, "createdAt">>(issues: T[]): T[] {
  return [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Case-insensitive search across everything a row shows: the title/note,
 *  the page, and the reporter. An empty query matches everything. */
export function matchesIssue(issue: Pick<Issue, "text" | "metadata">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    issueTitle(issue),
    pageLabel(issue.metadata.url),
    issue.metadata.identity?.email ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

/** "app.example.com/settings" from a full URL; returns the input if unparseable. */
export function pageLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

/** Just the path ("/settings") - the part that varies inside one project,
 *  where the domain is constant context. Empty for the root page or an
 *  unparseable URL. */
export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "" : u.pathname;
  } catch {
    return "";
  }
}
