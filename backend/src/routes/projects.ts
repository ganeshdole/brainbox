import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import {
  integrationConnections,
  issues,
  projectDestinations,
  projects,
} from "../db/schema/index.ts";
import { generateProjectKey } from "../lib/projectKey.ts";
import { toDestination, toIssue, toProject } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

// An origin as browsers send it: scheme + host (+ optional port), no path.
const origin = z
  .string()
  .max(300)
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, "must be an origin like https://app.example.com");

const createSchema = z.object({
  name: z.string().min(1).max(100),
  allowedOrigins: z.array(origin).max(20).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    allowedOrigins: z.array(origin).max(20).optional(),
  })
  .refine((b) => b.name !== undefined || b.allowedOrigins !== undefined, {
    message: "nothing to update",
  });

const provider = z.enum(["github"]);

const ghName = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/);

const destinationSchema = z.object({
  connectionId: z.string().min(1),
  config: z.object({
    owner: ghName,
    repo: ghName,
    labels: z.array(z.string().min(1).max(50)).max(10).default([]),
  }),
  enabled: z.boolean().default(true),
});

export const projectsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const rows = await db
      .select({ project: projects, issueCount: count(issues.id) })
      .from(projects)
      .leftJoin(issues, eq(issues.projectId, projects.id))
      .where(eq(projects.ownerId, uid))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt));
    return c.json(rows.map((r) => ({ ...toProject(r.project), issueCount: r.issueCount })));
  })
  .post("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const db = c.get("db");
    const [row] = await db
      .insert(projects)
      .values({
        ownerId: uid,
        name: parsed.data.name,
        key: generateProjectKey(),
        allowedOrigins: parsed.data.allowedOrigins ?? [],
      })
      .returning();
    if (!row) return c.json({ error: "Failed to create project" }, 500);
    return c.json(toProject(row), 201);
  })
  .patch("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const db = c.get("db");
    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!existing || existing.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const [row] = await db
      .update(projects)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.allowedOrigins !== undefined && {
          allowedOrigins: parsed.data.allowedOrigins,
        }),
      })
      .where(eq(projects.id, existing.id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row));
  })
  .get("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!row || row.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row));
  })
  .delete("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!existing || existing.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    // Issues go with it via the FK cascade; stored media is orphaned for now
    // (the Storage interface has no delete yet).
    await db.delete(projects).where(eq(projects.id, existing.id));
    return c.json({ ok: true });
  })
  .get("/:id/issues", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const projectId = c.req.param("id");
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const rows = await db
      .select()
      .from(issues)
      .where(eq(issues.projectId, projectId))
      .orderBy(desc(issues.createdAt));
    const storage = getStorage();
    return c.json(await Promise.all(rows.map((r) => toIssue(r, storage))));
  })
  .get("/:id/destinations", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const db = c.get("db");
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const rows = await db
      .select()
      .from(projectDestinations)
      .where(eq(projectDestinations.projectId, proj.id));
    return c.json(rows.map(toDestination));
  })
  .put("/:id/destinations/:provider", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const parsed = destinationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const db = c.get("db");
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, parsed.data.connectionId))
      .limit(1);
    if (!conn || conn.ownerId !== uid || conn.provider !== prov.data) {
      return c.json({ error: "Connection not found" }, 404);
    }
    const values = {
      connectionId: conn.id,
      config: parsed.data.config,
      enabled: parsed.data.enabled,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(projectDestinations)
      .values({ projectId: proj.id, provider: prov.data, ...values })
      .onConflictDoUpdate({
        target: [projectDestinations.projectId, projectDestinations.provider],
        set: values,
      })
      .returning();
    if (!row) return c.json({ error: "Failed to save destination" }, 500);
    return c.json(toDestination(row));
  })
  .delete("/:id/destinations/:provider", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const db = c.get("db");
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, c.req.param("id")))
      .limit(1);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    await db
      .delete(projectDestinations)
      .where(
        and(eq(projectDestinations.projectId, proj.id), eq(projectDestinations.provider, prov.data)),
      );
    return c.json({ ok: true });
  });
