import type { DeliveryResult } from "@ganeshdole/brainbox-integrations";

import { env } from "../env.ts";
import { publicFileUrl } from "../lib/public-files.ts";
import { toTicket } from "../lib/serialize.ts";
import type { DeliveryRecord, Store } from "../store/index.ts";
import { destinationFor } from "./registry.ts";

/**
 * Send one issue to its project's destinations and record each outcome. Never
 * throws. Idempotent per (issue, destination) unless `force` (retry / manual
 * send, which also reaches paused destinations).
 */
export async function deliverIssue(
  store: Store,
  issueId: string,
  opts: { force?: boolean } = {},
): Promise<DeliveryRecord[]> {
  const issue = await store.issues.get(issueId);
  if (!issue) return [];

  const force = opts.force ?? false;
  const targets = await store.integrations.deliveryTargets(issue.projectId, { includePaused: force });
  if (targets.length === 0) return [];

  const ticket = toTicket(issue, { dashboardOrigin: env.DASHBOARD_ORIGIN, fileUrl: publicFileUrl });
  const out: DeliveryRecord[] = [];

  for (const { destination: dest, connection: conn } of targets) {
    const row = await store.integrations.claimDelivery({
      issueId,
      destinationId: dest.id,
      provider: dest.provider,
      retry: force,
    });
    if (!row) continue;

    let result: DeliveryResult;
    try {
      result = await destinationFor(dest, conn).deliver(ticket);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (!result.ok) {
      console.error(`[integrations] ${dest.provider} delivery failed for issue ${issueId}: ${result.error}`);
    }
    const updated = await store.integrations.finishDelivery(
      row.id,
      result.ok ? { ok: true, externalId: result.externalId, url: result.url } : { ok: false, error: result.error },
    );
    if (updated) out.push(updated);
  }
  return out;
}
