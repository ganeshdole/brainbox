import type { DeliveryResult, Ticket } from "@ganeshdole/brainbox-integrations";

import type { Deps } from "../deps.ts";
import { publicFileUrl } from "../lib/public-files.ts";
import { toTicket } from "../lib/serialize.ts";
import { readStored } from "../storage/types.ts";
import type { ConnectionRecord, DeliveryRecord, DestinationRecord } from "../store/types.ts";
import { PROVIDER_NAME } from "./registry.ts";

/**
 * Send one issue to its project's destinations and record each outcome. Never
 * throws. Sends nothing when the store has no integrations module. Idempotent per (issue, destination) unless `force` (retry / manual
 * send, which also reaches paused destinations).
 */
export async function deliverIssue(
  deps: Deps,
  issueId: string,
  opts: { force?: boolean } = {},
): Promise<DeliveryRecord[]> {
  const { store, storage, options } = deps;
  const { integrations } = store;
  if (!integrations) return [];
  const issue = await store.issues.get(issueId);
  if (!issue) return [];

  const force = opts.force ?? false;
  const targets = await integrations.deliveryTargets(issue.projectId, { includePaused: force });
  if (targets.length === 0) return [];

  const ticket = toTicket(issue, {
    dashboardOrigin: options.dashboardOrigin,
    fileUrl: (key) => publicFileUrl(options, key),
    loadFile: (key) => readStored(storage, key),
  });
  const out: DeliveryRecord[] = [];

  for (const { destination: dest, connection: conn } of targets) {
    const row = await integrations.claimDelivery({
      issueId,
      destinationId: dest.id,
      provider: dest.provider,
      retry: force,
    });
    if (!row) continue;

    const result = await sendTicket(deps, dest, conn, ticket);
    if (!result.ok) {
      console.error(`[integrations] ${dest.provider} delivery failed for issue ${issueId}: ${result.error}`);
    }
    const updated = await integrations.finishDelivery(
      row.id,
      result.ok ? { ok: true, externalId: result.externalId, url: result.url } : { ok: false, error: result.error },
    );
    if (updated) out.push(updated);
  }
  return out;
}

/**
 * One ticket to one destination. Never throws. A connection whose credentials
 * were rejected isn't called until someone connects it again; a rejection now
 * (a revoked or expired token) marks it so. GitHub App installs mint their own
 * tokens, so a 401 there is ours to fix, not the Customer's.
 */
export async function sendTicket(
  deps: Deps,
  dest: DestinationRecord,
  conn: ConnectionRecord,
  ticket: Ticket,
): Promise<DeliveryResult> {
  const name = PROVIDER_NAME[dest.provider];
  const reconnect = `${name} rejected the token. Connect ${name} again in Settings.`;
  if (conn.status === "needs_reauth") return { ok: false, status: 401, error: reconnect };

  let result: DeliveryResult;
  try {
    result = await (await deps.integrations.destinationFor(dest, conn)).deliver(ticket);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!result.ok && result.status === 401 && conn.auth !== "app") {
    await deps.store.integrations?.setConnectionStatus(conn.id, "needs_reauth");
    return { ok: false, status: 401, error: reconnect };
  }
  return result;
}

/** What "Send a test report" sends: a made-up report, so the Customer sees
 *  what a real one will look like where it lands. */
export function testTicket(dashboardOrigin: string, project: { id: string; name: string }): Ticket {
  const settings = `${dashboardOrigin}/projects/${project.id}/settings`;
  return {
    id: "test",
    createdAt: new Date().toISOString(),
    text: `Test report from Brainbox\n\nThis is how reports from ${project.name} will arrive. It's safe to close.`,
    metadata: {
      url: settings,
      title: `${project.name} settings`,
      viewport: { width: 1280, height: 800 },
      devicePixelRatio: 1,
      userAgent: "Brainbox test report",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
      identity: { name: "Brainbox" },
    },
    links: { dashboard: settings },
  };
}
