import { renderTicket } from "@ganeshdole/brainbox-integrations";
import type { ReportStatusEvent, WorkItemState } from "@ganeshdole/brainbox-shared";
import { Webhook } from "standardwebhooks";

import { env } from "../env.ts";
import { publicFileUrl } from "../lib/public-files.ts";
import { toTicket } from "../lib/serialize.ts";
import type { DeliveryRecord, IssueRecord, ProjectRecord, Store, WorkItemUpdateRecord } from "../store/index.ts";

// Tells the host app (STATUS_WEBHOOK_URL) that a report's work item changed,
// so it can tell the person who reported it. One signed POST per recorded
// update; the outcome is kept on the update so a failure can be retried.
// docs/status-webhook.md is the contract.

const TIMEOUT_MS = 10_000;

export function statusWebhookConfigured(): boolean {
  return env.STATUS_WEBHOOK_URL !== "";
}

/** The event for one update, as the receiver gets it. */
export function buildStatusEvent(input: {
  update: WorkItemUpdateRecord;
  issue: IssueRecord;
  project: ProjectRecord;
  delivery: DeliveryRecord | undefined;
  now?: Date;
}): ReportStatusEvent {
  const { update, issue, project, delivery } = input;
  const ticket = toTicket(issue, { dashboardOrigin: env.DASHBOARD_ORIGIN, fileUrl: publicFileUrl });
  const identity = issue.metadata.identity;
  return {
    id: update.id,
    type: "report.work_item.updated",
    version: 1,
    createdAt: (input.now ?? new Date()).toISOString(),
    project: { id: project.id, key: project.key, name: project.name },
    report: {
      id: issue.id,
      kind: issue.kind,
      title: renderTicket(ticket).title,
      url: ticket.links.dashboard,
      status: issue.status,
      createdAt: issue.createdAt.toISOString(),
    },
    ...(identity && Object.values(identity).some((v) => v?.trim()) && { reporter: identity }),
    fields: (issue.metadata.fields ?? []).map(({ label, value, type }) => ({ label, value, ...(type && { type }) })),
    workItem: {
      provider: "azure-devops",
      id: Number(update.externalId),
      url: delivery?.externalUrl ?? "",
      ...(update.type && { type: update.type }),
      revision: update.revision,
    },
    change: {
      previous: stateOf(update.previousState, update.previousReason, update.previousCategory),
      current: stateOf(update.state, update.reason, update.category),
      stateChanged: update.previousState !== update.state,
      ...(update.changedByName && {
        changedBy: { name: update.changedByName, ...(update.changedByEmail && { email: update.changedByEmail }) },
      }),
      changedAt: update.changedAt.toISOString(),
      ...(update.comment && { comment: { html: update.comment, text: htmlToText(update.comment) } }),
    },
  };
}

/**
 * Sends one update's event and records how it went. Never throws. Null when
 * no webhook is configured or the update (or its report) is gone. A retry
 * sends the same event id, so the receiver can tell it's a repeat.
 */
export async function notifyStatus(store: Store, updateId: string): Promise<WorkItemUpdateRecord | null> {
  if (!statusWebhookConfigured()) return null;
  try {
    const update = await store.integrations.getWorkItemUpdate(updateId);
    const issue = update && (await store.issues.get(update.issueId));
    const project = issue && (await store.projects.get(issue.projectId));
    if (!update || !issue || !project) return null;
    const delivery = (await store.integrations.listDeliveries(issue.id)).find(
      (d) => d.provider === update.provider && d.externalId === update.externalId,
    );
    const event = buildStatusEvent({ update, issue, project, delivery });
    const outcome = await post(event);
    if (!outcome.ok) console.error(`[integrations] status webhook failed for update ${update.id}: ${outcome.error}`);
    return await store.integrations.finishNotification(update.id, outcome);
  } catch (err) {
    console.error(`[integrations] status webhook failed for update ${updateId}:`, err);
    return null;
  }
}

async function post(event: ReportStatusEvent): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = JSON.stringify(event);
  const sentAt = new Date();
  const signature = new Webhook(env.STATUS_WEBHOOK_SECRET).sign(event.id, sentAt, body);
  try {
    const res = await fetch(env.STATUS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": event.id,
        "webhook-timestamp": String(Math.floor(sentAt.getTime() / 1000)),
        "webhook-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).trim().slice(0, 200);
    return { ok: false, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function stateOf(state: string, reason: string | null, category: WorkItemState["category"] | null): WorkItemState {
  return { state, ...(reason && { reason }), ...(category && { category }) };
}

/** A comment's HTML as plain text: line breaks kept, tags dropped, entities read. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
