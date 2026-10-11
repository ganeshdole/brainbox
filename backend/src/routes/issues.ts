import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { deliveries, issues, projects } from "../db/schema/index.ts";
import { deliverIssue } from "../integrations/dispatch.ts";
import { toDelivery, toIssue } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

export const issuesRoute = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const [row] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, c.req.param("id")))
      .limit(1);
    if (!row) return c.json({ error: "Not found" }, 404);
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const sent = await db.select().from(deliveries).where(eq(deliveries.issueId, row.id));
    return c.json(await toIssue(row, getStorage(), sent));
  })
  .post("/:id/deliveries", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const [row] = await db
      .select({ issue: issues, ownerId: projects.ownerId })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(eq(issues.id, c.req.param("id")))
      .limit(1);
    if (!row || row.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const results = await deliverIssue(row.issue.id, { force: true });
    if (results.length === 0) return c.json({ error: "No destination configured" }, 409);
    return c.json(results.map(toDelivery));
  });
