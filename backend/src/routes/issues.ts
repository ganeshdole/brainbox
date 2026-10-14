import { Hono } from "hono";
import { z } from "zod";

import { deliverIssue } from "../integrations/dispatch.ts";
import { issueAccess } from "../lib/access.ts";
import { toDelivery, toIssue, toIssueEvent } from "../lib/serialize.ts";
import { triageError } from "../store/issue-triage.ts";
import { requireModule } from "../store/modules.ts";
import type { AppEnv } from "../types.ts";

const featureLink = z.object({ featureId: z.string().min(1).nullable() });

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

/** Reading an issue: the core. Its deliveries come along when the store keeps them. */
export const issuesRoute = new Hono<AppEnv>().get("/:id", async (c) => {
  const access = await issueAccess(c, c.req.param("id"));
  if (access instanceof Response) return access;
  const { store, storage } = c.get("deps");
  const sent = store.integrations ? await store.integrations.listDeliveries(access.issue.id) : undefined;
  return c.json(await toIssue(access.issue, storage, sent));
});

/** Triage: status, priority and close reason, one issue or many, and the
 *  activity log. Mounted with the triage module. */
export const triageRoute = new Hono<AppEnv>()
  .patch("/:id", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const parsed = triageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const error = triageError(access.issue, parsed.data);
    if (error) return c.json({ error }, 400);
    const triage = requireModule(c.get("store"), "triage");
    const [row] = await triage.apply([access.issue.id], parsed.data, access.uid);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(await toIssue(row, c.get("deps").storage));
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
    const updated = await requireModule(c.get("store"), "triage").apply(unique, patch, uid);
    const { storage } = c.get("deps");
    return c.json(await Promise.all(updated.map((row) => toIssue(row, storage))));
  })
  .get("/:id/activity", async (c) => {
    const access = await issueAccess(c, c.req.param("id"));
    if (access instanceof Response) return access;
    const store = c.get("store");
    const events = await requireModule(store, "triage").listEvents(access.issue.id);
    const adapter = requireModule(store, "auth").adapter();
    const names = new Map<string, string>();
    for (const actorId of new Set(events.map((e) => e.actorId))) {
      if (!actorId) continue;
      const user = await adapter.getUser?.(actorId);
      const name = user?.name ?? user?.email;
      if (name) names.set(actorId, name);
    }
    return c.json(events.map((e) => toIssueEvent(e, names)));
  });

/** Attach a feature request to one of its project's features, or send it
 *  back to waiting with { featureId: null }. Mounted with the features module. */
export const issueFeatureRoute = new Hono<AppEnv>().put("/:id/feature", async (c) => {
  const parsed = featureLink.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
  const access = await issueAccess(c, c.req.param("id"));
  if (access instanceof Response) return access;
  const { issue } = access;
  const store = c.get("store");
  const features = requireModule(store, "features");
  if (issue.kind !== "feature") return c.json({ error: "Only a feature request joins a feature" }, 400);
  const { featureId } = parsed.data;
  if (featureId !== null) {
    const feature = await features.get(featureId);
    if (!feature || feature.projectId !== issue.projectId) {
      return c.json({ error: "Feature not found" }, 404);
    }
  }
  await features.attach(issue.id, featureId);
  const row = await store.issues.get(issue.id);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(await toIssue(row, c.get("deps").storage));
});

/** Send an issue to its destinations now. Mounted with the integrations module. */
export const issueDeliveriesRoute = new Hono<AppEnv>().post("/:id/deliveries", async (c) => {
  const access = await issueAccess(c, c.req.param("id"));
  if (access instanceof Response) return access;
  const results = await deliverIssue(c.get("deps"), access.issue.id, { force: true });
  if (results.length === 0) return c.json({ error: "No destination configured" }, 409);
  return c.json(results.map(toDelivery));
});
