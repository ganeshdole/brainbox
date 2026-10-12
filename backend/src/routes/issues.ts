import { Hono } from "hono";

import { deliverIssue } from "../integrations/dispatch.ts";
import { toDelivery, toIssue } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

export const issuesRoute = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const row = await store.issues.get(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    const proj = await store.projects.get(row.projectId);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const sent = await store.integrations.listDeliveries(row.id);
    return c.json(await toIssue(row, getStorage(), sent));
  })
  .post("/:id/deliveries", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const issue = await store.issues.get(c.req.param("id"));
    const proj = issue ? await store.projects.get(issue.projectId) : null;
    if (!issue || !proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const results = await deliverIssue(store, issue.id, { force: true });
    if (results.length === 0) return c.json({ error: "No destination configured" }, 409);
    return c.json(results.map(toDelivery));
  });
