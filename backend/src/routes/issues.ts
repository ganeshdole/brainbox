import { Hono } from "hono";

import { deliverIssue } from "../integrations/dispatch.ts";
import { projectAccess } from "../lib/access.ts";
import { toDelivery, toIssue } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

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
  // Any member may resend: a report that failed to reach GitHub is everyone's
  // problem, and resending changes nothing but the delivery.
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
