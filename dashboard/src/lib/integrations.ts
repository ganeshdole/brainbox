import type {
  AzureDevopsBugsBehavior,
  AzureDevopsIterationConfig,
  AzureDevopsWorkItemType,
  Delivery,
  IntegrationProvider,
} from "@ganeshdole/brainbox-shared";

export type DeliveryTone = "ok" | "error" | "muted";

export interface DeliveryLabel {
  text: string;
  tone: DeliveryTone;
  href?: string;
}

export const PROVIDER_NAME: Record<IntegrationProvider, string> = {
  github: "GitHub",
  "azure-devops": "Azure DevOps",
};

export function deliveryLabel(d: Delivery): DeliveryLabel {
  const name = PROVIDER_NAME[d.provider];
  switch (d.status) {
    case "sent":
      return { text: d.externalId ? `${name} #${d.externalId}` : name, tone: "ok", href: d.url };
    case "failed":
      return { text: `${name}: ${d.error ?? "delivery failed"}`, tone: "error" };
    case "pending":
      return { text: `Sending to ${name}…`, tone: "muted" };
  }
}

/** Outcome of the GitHub install round-trip, from the `?github=` the backend redirects with. */
export function installResult(search: URLSearchParams): "connected" | "error" | null {
  const v = search.get("github");
  return v === "connected" || v === "error" ? v : null;
}

/** "bug, feedback ,," → ["bug", "feedback"], de-duplicated. */
export function parseLabels(input: string): string[] {
  return [...new Set(input.split(",").map((l) => l.trim()).filter(Boolean))];
}

// Azure DevOps setup.

/** The first of `preferred` the project's process has, else its first type. */
function firstOf(types: AzureDevopsWorkItemType[], preferred: string[]): string {
  const names = types.map((t) => t.name);
  return preferred.find((p) => names.includes(p)) ?? names[0] ?? "";
}

/** What bugs are filed as by default: Bug, or Issue in the Basic process. */
export function defaultBugType(types: AzureDevopsWorkItemType[]): string {
  return firstOf(types, ["Bug", "Issue"]);
}

/** What feature requests are filed as by default: each process's backlog
 *  item (Agile, Scrum, CMMI, Basic), else whatever bugs use. */
export function defaultFeatureType(types: AzureDevopsWorkItemType[]): string {
  return firstOf(types, ["User Story", "Product Backlog Item", "Requirement", "Issue", "Bug"]);
}

/**
 * Why a Bug wouldn't show where the team looks, given how the team works with
 * bugs. Only the Bug type is affected; other types follow their own backlog.
 */
export function bugVisibilityWarning(
  type: string,
  bugsBehavior: AzureDevopsBugsBehavior,
  iteration: AzureDevopsIterationConfig["kind"],
): string | null {
  if (type !== "Bug") return null;
  if (bugsBehavior === "off") {
    return "This team doesn't show Bugs on its boards. Pick another type, or change the team's bug setting in Azure DevOps.";
  }
  if (bugsBehavior === "asTasks" && iteration === "backlog") {
    return "This team shows Bugs on the sprint taskboard only, so on the backlog they'd show on no board. Send them to the current sprint.";
  }
  return null;
}
