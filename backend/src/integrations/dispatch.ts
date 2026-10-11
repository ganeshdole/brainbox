import { and, eq, sql } from "drizzle-orm";
import type { DeliveryResult } from "@brainbox/integrations";

import { db } from "../db/client.ts";
import {
  deliveries,
  integrationConnections,
  issues,
  projectDestinations,
} from "../db/schema/index.ts";
import { env } from "../env.ts";
import { publicFileUrl } from "../lib/public-files.ts";
import { toTicket } from "../lib/serialize.ts";
import { destinationFor } from "./registry.ts";

export type DeliveryRow = typeof deliveries.$inferSelect;

/**
 * Send one issue to its project's destinations and record each outcome. Never
 * throws. Idempotent per (issue, destination) unless `force` (retry / manual
 * send, which also reaches paused destinations).
 */
export async function deliverIssue(
  issueId: string,
  opts: { force?: boolean } = {},
): Promise<DeliveryRow[]> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) return [];

  const targets = await db
    .select({ dest: projectDestinations, conn: integrationConnections })
    .from(projectDestinations)
    .innerJoin(integrationConnections, eq(integrationConnections.id, projectDestinations.connectionId))
    .where(
      opts.force
        ? eq(projectDestinations.projectId, issue.projectId)
        : and(eq(projectDestinations.projectId, issue.projectId), eq(projectDestinations.enabled, true)),
    );
  if (targets.length === 0) return [];

  const ticket = toTicket(issue, { dashboardOrigin: env.DASHBOARD_ORIGIN, fileUrl: publicFileUrl });
  const out: DeliveryRow[] = [];

  for (const { dest, conn } of targets) {
    const claim = db
      .insert(deliveries)
      .values({ issueId, destinationId: dest.id, provider: dest.provider, status: "pending" });
    const [row] = opts.force
      ? await claim
          .onConflictDoUpdate({
            target: [deliveries.issueId, deliveries.destinationId],
            set: { status: "pending", error: null, updatedAt: new Date() },
          })
          .returning()
      : await claim.onConflictDoNothing().returning();
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
    const [updated] = await db
      .update(deliveries)
      .set({
        status: result.ok ? "sent" : "failed",
        externalId: result.ok ? result.externalId : row.externalId,
        externalUrl: result.ok ? result.url : row.externalUrl,
        error: result.ok ? null : result.error,
        attempts: sql`${deliveries.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, row.id))
      .returning();
    if (updated) out.push(updated);
  }
  return out;
}
