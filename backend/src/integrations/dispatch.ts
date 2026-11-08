import type { DeliveryResult, Ticket } from "@ganeshdole/brainbox-integrations";
import type { IntegrationProvider } from "@ganeshdole/brainbox-shared";

import type { Deps } from "../deps.ts";
import { publicFileUrl } from "../lib/public-files.ts";
import { toTicket } from "../lib/serialize.ts";
import { readStored } from "../storage/types.ts";
import { UnreadableCredentialsError } from "../store/credentials.ts";
import type { ConnectionRecord, DeliveryRecord, DestinationRecord } from "../store/types.ts";
import { reportUnreadableToken, UNREADABLE_TOKEN } from "./azure-devops.ts";
import { PROVIDER_NAME } from "./registry.ts";

/**
 * Send one issue to its project's destinations and record each outcome. Never
 * throws: a store that fails is logged, and the destinations it failed for are
 * left out of the result. Sends nothing when the store has no integrations
 * module. Idempotent per (issue, destination) unless `force` (retry / manual
 * send, which also reaches paused destinations); even then a destination the
 * issue was already sent to, or is being sent to right now, is skipped
 * (`claimDelivery`). `provider` limits it to that one. Returns the deliveries
 * this call attempted.
 */
export async function deliverIssue(
  deps: Deps,
  issueId: string,
  opts: { force?: boolean; provider?: IntegrationProvider } = {},
): Promise<DeliveryRecord[]> {
  const { store, storage, options } = deps;
  const { integrations } = store;
  if (!integrations) return [];
  const force = opts.force ?? false;

  let targets: Array<{ destination: DestinationRecord; connection: ConnectionRecord }>;
  let ticket: Ticket;
  try {
    const issue = await store.issues.get(issueId);
    if (!issue) return [];
    targets = await integrations.deliveryTargets(issue.projectId, { includePaused: force });
    if (targets.length === 0) return [];
    ticket = toTicket(issue, {
      dashboardOrigin: options.dashboardOrigin,
      fileUrl: (key) => publicFileUrl(options, key),
      loadFile: (key) => readStored(storage, key),
    });
  } catch (err) {
    console.error(`[integrations] could not look up where to deliver issue ${issueId}:`, err);
    return [];
  }
  const out: DeliveryRecord[] = [];

  for (const { destination: dest, connection: conn } of targets) {
    if (opts.provider && dest.provider !== opts.provider) continue;
    try {
      const row = await integrations.claimDelivery({
        issueId,
        destinationId: dest.id,
        provider: dest.provider,
        retry: force,
        now: new Date(),
      });
      if (!row) continue;

      const result = await sendTicket(deps, dest, conn, ticket);
      if (!result.ok) {
        console.error(`[integrations] ${dest.provider} delivery failed for issue ${issueId}: ${result.error}`);
      }
      const updated = await integrations.finishDelivery(
        row,
        result.ok ? { ok: true, externalId: result.externalId, url: result.url } : { ok: false, error: result.error },
      );
      if (updated) out.push(updated);
      else {
        // Only after the lease ran out and another attempt claimed it.
        console.warn(
          `[integrations] ${dest.provider} delivery of issue ${issueId} was claimed again before it finished; ` +
            `its outcome (${result.ok ? `sent as ${result.url}` : result.error}) was not recorded`,
        );
      }
    } catch (err) {
      // A claimed delivery stays pending until its lease runs out, then a
      // retry can claim it (store/delivery-rules.ts).
      console.error(`[integrations] could not record the ${dest.provider} delivery of issue ${issueId}:`, err);
    }
  }
  return out;
}

/**
 * One ticket to one destination. Never throws. A connection whose credentials
 * were rejected isn't called until someone connects it again; a rejection now
 * (a revoked or expired token) marks it so, unless the connection has been
 * given new credentials since. A token that can't be opened fails the
 * delivery but marks nothing: it is most likely the deployment's encryption
 * key, and putting the right key back must be enough. GitHub App installs
 * mint their own tokens, so a 401 there is ours to fix, not the Customer's.
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
    if (err instanceof UnreadableCredentialsError) {
      reportUnreadableToken(conn, err);
      return { ok: false, error: UNREADABLE_TOKEN };
    }
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (result.ok || result.status !== 401 || conn.auth === "app") return result;
  try {
    await deps.store.integrations?.setConnectionStatus(conn.id, "needs_reauth", { credentials: conn.credentials });
  } catch (err) {
    console.error(`[integrations] could not mark connection ${conn.id} as needing a new token:`, err);
  }
  return { ok: false, status: 401, error: reconnect };
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
