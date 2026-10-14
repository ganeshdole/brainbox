import { Hono } from "hono";
import { z } from "zod";

import { deliverIssue } from "../integrations/dispatch.ts";
import { projectAccess } from "../lib/access.ts";
import { toDelivery, toIssue } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

const featureLink = z.object({ featureId: z.string().min(1).nullable() });

export const issuesRoute = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const store = c.get("store");
    const row = await store.issues.get(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    const access = await projectAccess(c, row.projectId, "member");
    if (access instanceof Response) return access;
    const sent = await store.integrations.listDeliveries(row.id);
    return c.json(await toIssue(row, getStorage(), sent));
  })
  // Attach a feature request to one of its project's features, or send it
  // back to waiting with { featureId: null }.
  .put("/:id/feature", async (c) => {
    const parsed = featureLink.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const store = c.get("store");
    const issue = await store.issues.get(c.req.param("id"));
    if (!issue) return c.json({ error: "Not found" }, 404);
    const access = await projectAccess(c, issue.projectId, "member");
    if (access instanceof Response) return access;
    if (issue.kind !== "feature") return c.json({ error: "Only a feature request joins a feature" }, 400);
    const { featureId } = parsed.data;
    if (featureId !== null) {
      const feature = await store.features.get(featureId);
      if (!feature || feature.projectId !== issue.projectId) {
        return c.json({ error: "Feature not found" }, 404);
      }
    }
    await store.issues.setFeature(issue.id, featureId);
    const row = await store.issues.get(issue.id);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(await toIssue(row, getStorage()));
  })
  .post("/:id/deliveries", async (c) => {
    const store = c.get("store");
    const issue = await store.issues.get(c.req.param("id"));
    if (!issue) return c.json({ error: "Not found" }, 404);
    const access = await projectAccess(c, issue.projectId, "member");
    if (access instanceof Response) return access;
    const results = await deliverIssue(store, issue.id, { force: true });
    if (results.length === 0) return c.json({ error: "No destination configured" }, 409);
    return c.json(results.map(toDelivery));
  });
