import type { IssueKind } from "./feedback.ts";
import type { Identity, ReportField } from "./metadata.ts";
import type { IntegrationProvider } from "./integrations.ts";
import type { IssueStatus } from "./issue.ts";

/**
 * What a work item state means, whatever the process calls it: Azure DevOps'
 * own state categories. "New" in Agile and "To Do" in Basic are both Proposed.
 */
export type WorkItemStateCategory = "Proposed" | "InProgress" | "Resolved" | "Completed" | "Removed";

/** A state, the reason it was entered, and the category it belongs to. */
export interface WorkItemState {
  state: string;
  reason?: string;
  category?: WorkItemStateCategory;
}

/**
 * The event Brainbox POSTs to `STATUS_WEBHOOK_URL` when the work item a
 * report became changes state or gets a comment. Version 1; fields are only
 * ever added within a version. The request is signed the Standard Webhooks
 * way (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers), and a
 * retry sends the same `id`. docs/status-webhook.md is the contract.
 */
export interface ReportStatusEvent {
  /** Unique per update; the same on a retry, so receivers can drop repeats. */
  id: string;
  type: "report.work_item.updated";
  version: 1;
  /** When Brainbox built the event. */
  createdAt: string;
  project: { id: string; key: string; name: string };
  report: {
    id: string;
    kind: IssueKind;
    /** The first line of what the end-user wrote, as the work item's title. */
    title: string;
    /** The report in the Brainbox dashboard. */
    url: string;
    /** Its triage status in Brainbox after this update. */
    status: IssueStatus;
    createdAt: string;
  };
  /** Who sent the report, as the host app identified them. `id` is the host
   *  app's own user id. Absent when the report was anonymous. */
  reporter?: Identity;
  /** The host app's own details, as it labelled them (Organization, Location,
   *  Tenant ID, Location ID...). */
  fields: ReportField[];
  workItem: {
    provider: Extract<IntegrationProvider, "azure-devops">;
    id: number;
    url: string;
    type?: string;
    /** Azure DevOps' revision number of the work item after this change. */
    revision: number;
  };
  change: {
    /** As it was before this change; the same as `current` when only a
     *  comment was added. */
    previous: WorkItemState;
    current: WorkItemState;
    /** Whether the state itself changed, rather than only a comment. */
    stateChanged: boolean;
    changedBy?: { name: string; email?: string };
    changedAt: string;
    /** The comment added with this change, if any. Azure DevOps stores HTML;
     *  `text` is the same with the markup removed. */
    comment?: { html: string; text: string };
  };
}
