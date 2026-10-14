import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Feature, FeatureDetail } from "@ganeshdole/brainbox-shared";

import { projectAccess } from "../lib/access.ts";
import { toFeature, toIssue } from "../lib/serialize.ts";
import { getStorage } from "../storage/index.ts";
import type { FeatureRecord, Store } from "../store/index.ts";
import type { AppEnv } from "../types.ts";

// A project's features: the things its users want built, each collecting the
// feature-request issues filed through the widget. Mounted under /api, so
// these paths read /api/projects/:projectId/features and /api/features/:id.

const status = z.enum(["under_review", "planned", "in_progress", "shipped", "declined"]);
const title = z.string().trim().min(1).max(200);
// An empty description is no description.
const description = z
  .string()
  .trim()
  .max(5000)
  .transform((d) => d || null);

const createSchema = z.object({
  title,
  description: description.optional(),
  status: status.optional(),
  /** Feature requests to attach straight away, e.g. the one it was made from. */
  requestIds: z.array(z.string().min(1)).max(100).optional(),
});

const updateSchema = z
  .object({ title: title.optional(), description: description.nullable().optional(), status: status.optional() })
  .refine((b) => b.title !== undefined || b.description !== undefined || b.status !== undefined, {
    message: "nothing to update",
  });

const mergeSchema = z.object({ into: z.string().min(1) });

/** The feature, if the caller is a member of its project's Team. Otherwise
 *  the response to send, as `projectAccess` decides it. */
async function featureAccess(c: Context<AppEnv>, id: string): Promise<FeatureRecord | Response> {
  const feature = await c.get("store").features.get(id);
  if (!feature) return c.json({ error: "Not found" }, 404);
  const access = await projectAccess(c, feature.projectId, "member");
  return access instanceof Response ? access : feature;
}

/** The feature as the API shows it, with its current request count. */
async function present(store: Store, feature: FeatureRecord): Promise<Feature> {
  const listed = await store.features.listForProject(feature.projectId);
  return toFeature(feature, listed.find((f) => f.id === feature.id)?.requestCount ?? 0);
}

export const featuresRoute = new Hono<AppEnv>()
  .get("/projects/:projectId/features", async (c) => {
    const access = await projectAccess(c, c.req.param("projectId"), "member");
    if (access instanceof Response) return access;
    const rows = await c.get("store").features.listForProject(access.project.id);
    return c.json(rows.map((r) => toFeature(r, r.requestCount)));
  })
  .post("/projects/:projectId/features", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const access = await projectAccess(c, c.req.param("projectId"), "member");
    if (access instanceof Response) return access;
    const { project } = access;
    const store = c.get("store");

    // Check every request before creating anything, so a bad id leaves no
    // half-made feature behind.
    const requestIds = [...new Set(parsed.data.requestIds ?? [])];
    for (const id of requestIds) {
      const issue = await store.issues.get(id);
      if (!issue || issue.projectId !== project.id || issue.kind !== "feature") {
        return c.json({ error: "Not a feature request in this project" }, 400);
      }
    }

    const feature = await store.features.create({
      projectId: project.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
    });
    for (const id of requestIds) await store.issues.setFeature(id, feature.id);
    return c.json(toFeature(feature, requestIds.length), 201);
  })
  .get("/features/:id", async (c) => {
    const store = c.get("store");
    const feature = await featureAccess(c, c.req.param("id"));
    if (feature instanceof Response) return feature;
    const rows = (await store.issues.listForProject(feature.projectId)).filter(
      (r) => r.featureId === feature.id,
    );
    const storage = getStorage();
    const detail: FeatureDetail = {
      ...toFeature(feature, rows.length),
      requests: await Promise.all(rows.map((r) => toIssue(r, storage))),
    };
    return c.json(detail);
  })
  .patch("/features/:id", async (c) => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const store = c.get("store");
    const feature = await featureAccess(c, c.req.param("id"));
    if (feature instanceof Response) return feature;
    const updated = await store.features.update(feature.id, parsed.data);
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(await present(store, updated));
  })
  .delete("/features/:id", async (c) => {
    const store = c.get("store");
    const feature = await featureAccess(c, c.req.param("id"));
    if (feature instanceof Response) return feature;
    await store.features.delete(feature.id);
    return c.json({ ok: true });
  })
  .post("/features/:id/merge", async (c) => {
    const parsed = mergeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const store = c.get("store");
    const from = await featureAccess(c, c.req.param("id"));
    if (from instanceof Response) return from;
    const into = await featureAccess(c, parsed.data.into);
    if (into instanceof Response) return into;
    if (from.id === into.id || from.projectId !== into.projectId) {
      return c.json({ error: "Can only merge two features of the same project" }, 400);
    }
    await store.features.merge(from.id, into.id);
    const merged = await store.features.get(into.id);
    if (!merged) return c.json({ error: "Not found" }, 404);
    return c.json(await present(store, merged));
  });
