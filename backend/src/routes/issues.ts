import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { deliverIssue } from "../integrations/dispatch.ts";
import { projectAccess } from "../lib/access.ts";
import { toDelivery, toIssue, toIssueEvent } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { IssueRecord } from "../store/index.ts";
import { triageError } from "../store/issue-triage.ts";
import type { AppEnv } from "../types.ts";

const triageSchema = z
  .object({
    status: z.enum(["new", "open", "in_progress", "resolved", "closed"]).optional(),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
    closeReason: z.enum(["wont_fix", "duplicate", "not_reproducible", "spam"]).nullable().optional(),
  })
  .refine((p) => p.status !== undefined || p.priority !== undefined || p.closeReason !== undefined, {
    message: "nothing to update",
  });

/** Bulk edits: one patch for up to 100 issues. */
const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  patch: triageSchema,
});

/**
 * The issue and its caller, when the caller may work on it; otherwise the
 * response to send. Access is the issue's project's, through its Team: every
 * member may read and triage (404 outside the Team, the same as no issue;
 * 402 when the Team's plan has lapsed). The one place issue access is decided.
 */
async function issueAccess(
  c: Context<AppEnv>,
  id: string,
): Promise<{ uid: string; issue: IssueRecord } | Response> {
  const issue = await c.get("store").issues.get(id);
  if (!issue) return c.json({ error: "Not found" }, 404);
  const access = await projectAccess(c, issue.projectId, "member");
  return access instanceof Response ? access : { uid: access.uid, issue };
}

export const issuesRoute = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const sent = await c.get("store").integrations.listDeliveries(access.issue.id);
    return c.json(await toIssue(access.issue, getStorage(), sent));
  })
  .patch("/:id", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const parsed = triageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const error = triageError(access.issue, parsed.data);
    if (error) return c.json({ error }, 400);
    const [row] = await c.get("store").issues.triage([access.issue.id], parsed.data, access.uid);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(await toIssue(row, getStorage()));
  })
  .patch("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = bulkSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const { ids, patch } = parsed.data;
    // Check every id before changing any; the store then writes them all in
    // one transaction, so the edit is all or nothing.
    const unique = [...new Set(ids)];
    for (const id of unique) {
      const access = await issueAccess(c, id);
      if (access instanceof Response) return access;
      const error = triageError(access.issue, patch);
      if (error) return c.json({ error, id }, 400);
    }
    const updated = await c.get("store").issues.triage(unique, patch, uid);
    const storage = getStorage();
    return c.json(await Promise.all(updated.map((row) => toIssue(row, storage))));
  })
  .get("/:id/activity", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const store = c.get("store");
    const events = await store.issues.listEvents(access.issue.id);
    const adapter = store.authAdapter();
    const names = new Map<string, string>();
    for (const actorId of new Set(events.map((e) => e.actorId))) {
      if (!actorId) continue;
      const user = await adapter.getUser?.(actorId);
      const name = user?.name ?? user?.email;
      if (name) names.set(actorId, name);
    }
    return c.json(events.map((e) => toIssueEvent(e, names)));
  })
  // Any member may resend: a report that failed to reach GitHub is everyone's
  // problem, and resending changes nothing but the delivery.
  .post("/:id/deliveries", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const results = await deliverIssue(c.get("store"), access.issue.id, { force: true });
    if (results.length === 0) return c.json({ error: "No destination configured" }, 409);
    return c.json(results.map(toDelivery));
  });
