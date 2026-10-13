import { Hono } from "hono";
import { z } from "zod";

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
    featureLabels: z.array(z.string().min(1).max(50)).max(10).optional(),
  }),
  enabled: z.boolean().default(true),
});

export const projectsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const rows = await c.get("store").projects.listForOwner(uid);
    return c.json(rows.map((r) => ({ ...toProject(r), issueCount: r.issueCount })));
  })
  .post("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const row = await c.get("store").projects.create({
      ownerId: uid,
      name: parsed.data.name,
      key: generateProjectKey(),
      allowedOrigins: parsed.data.allowedOrigins ?? [],
    });
    return c.json(toProject(row), 201);
  })
  .patch("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const store = c.get("store");
    const existing = await store.projects.get(c.req.param("id"));
    if (!existing || existing.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const row = await store.projects.update(existing.id, parsed.data);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row));
  })
  .get("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const row = await c.get("store").projects.get(c.req.param("id"));
    if (!row || row.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row));
  })
  .delete("/:id", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const existing = await store.projects.get(c.req.param("id"));
    if (!existing || existing.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    // Issues go with it; stored media is orphaned for now (the Storage
    // interface has no delete yet).
    await store.projects.delete(existing.id);
    return c.json({ ok: true });
  })
  .get("/:id/issues", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const proj = await store.projects.get(c.req.param("id"));
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const rows = await store.issues.listForProject(proj.id);
    const storage = getStorage();
    return c.json(await Promise.all(rows.map((r) => toIssue(r, storage))));
  })
  .get("/:id/destinations", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const proj = await store.projects.get(c.req.param("id"));
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const rows = await store.integrations.listDestinations(proj.id);
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
    const store = c.get("store");
    const proj = await store.projects.get(c.req.param("id"));
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const conn = await store.integrations.getConnection(parsed.data.connectionId);
    if (!conn || conn.ownerId !== uid || conn.provider !== prov.data) {
      return c.json({ error: "Connection not found" }, 404);
    }
    const row = await store.integrations.saveDestination({
      projectId: proj.id,
      provider: prov.data,
      connectionId: conn.id,
      config: parsed.data.config,
      enabled: parsed.data.enabled,
    });
    return c.json(toDestination(row));
  })
  .delete("/:id/destinations/:provider", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const store = c.get("store");
    const proj = await store.projects.get(c.req.param("id"));
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    await store.integrations.deleteDestination(proj.id, prov.data);
    return c.json({ ok: true });
  });
