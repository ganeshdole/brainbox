import { Hono } from "hono";
import { z } from "zod";

import { prepareDestination } from "../integrations/azure-devops.ts";
import { sendTicket, testTicket } from "../integrations/dispatch.ts";
import { PROVIDER_NAME } from "../integrations/registry.ts";
import { projectAccess } from "../lib/access.ts";
import { toDestination } from "../lib/serialize.ts";
import { requireModule } from "../store/modules.ts";
import type { AppEnv } from "../types.ts";

const provider = z.enum(["github", "azure-devops"]);

const ghName = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/);

const githubConfig = z.object({
  owner: ghName,
  repo: ghName,
  labels: z.array(z.string().min(1).max(50)).max(10).default([]),
  featureLabels: z.array(z.string().min(1).max(50)).max(10).optional(),
});

const adoNamed = z.object({ id: z.string().min(1).max(100), name: z.string().min(1).max(256) });
const adoPath = z.string().min(1).max(4000);

const adoWorkItem = z.object({
  type: z.string().min(1).max(128),
  iteration: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("backlog"), path: adoPath }),
    z.object({ kind: z.literal("current") }),
    z.object({ kind: z.literal("fixed"), path: adoPath }),
  ]),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  priority: z.number().int().min(1).max(4).optional(),
  fields: z
    .array(z.object({ referenceName: z.string().min(1).max(256), value: z.string().max(4000) }))
    .max(50)
    .default([]),
});

const azureDevopsConfig = z.object({
  project: adoNamed,
  team: adoNamed,
  areaPath: adoPath,
  assignedTo: z.string().trim().min(1).max(256).optional(),
  bug: adoWorkItem,
  feature: adoWorkItem,
});

/** A destination to save: the body (`DestinationInputs` for its config) plus
 *  the provider from the path, so `config` narrows on it. */
const destinationSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("github"),
    connectionId: z.string().min(1),
    config: githubConfig,
    enabled: z.boolean().default(true),
  }),
  z.object({
    provider: z.literal("azure-devops"),
    connectionId: z.string().min(1),
    config: azureDevopsConfig,
    enabled: z.boolean().default(true),
  }),
]);

const REJECTED = { error: "Azure DevOps rejected the token. Connect Azure DevOps again.", code: "needs_reauth" };

/** A project's destinations: /api/projects/:id/destinations. Mounted with the
 *  integrations module. */
export const destinationsRoute = new Hono<AppEnv>()
  .get("/:id/destinations", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    const rows = await requireModule(c.get("store"), "integrations").listDestinations(access.project.id);
    return c.json(rows.map(toDestination));
  })
  // Azure DevOps destinations are proved before they are saved: each kind of
  // report is dry-run created, and a rule it breaks comes back as a 422.
  .put("/:id/destinations/:provider", async (c) => {
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = destinationSchema.safeParse({
      ...(typeof body === "object" && body !== null ? body : {}),
      provider: prov.data,
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const input = parsed.data;
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const deps = c.get("deps");
    const integrations = requireModule(deps.store, "integrations");
    const conn = await integrations.getConnection(input.connectionId);
    if (!conn || conn.teamId !== access.project.teamId || conn.provider !== input.provider) {
      return c.json({ error: "Connection not found" }, 404);
    }
    const common = { projectId: access.project.id, connectionId: conn.id, enabled: input.enabled };

    if (input.provider === "github") {
      const row = await integrations.saveDestination({ ...common, provider: "github", config: input.config });
      return c.json(toDestination(row));
    }
    const ado = deps.integrations.azureDevops;
    if (!ado) {
      return c.json({ error: "Azure DevOps is not configured on this deployment" }, 503);
    }
    if (conn.status === "needs_reauth") return c.json(REJECTED, 409);
    const prepared = await prepareDestination(ado, conn, input.config);
    if (!prepared.ok) {
      if (!prepared.rejected) return c.json({ error: prepared.error }, prepared.status);
      await integrations.setConnectionStatus(conn.id, "needs_reauth");
      return c.json(REJECTED, 409);
    }
    const row = await integrations.saveDestination({
      ...common,
      provider: "azure-devops",
      config: prepared.config,
    });
    return c.json(toDestination(row));
  })
  // Sends a made-up report through the saved destination, paused or not, and
  // links to what it made. Nothing is recorded: there is no issue behind it.
  .post("/:id/destinations/:provider/test", async (c) => {
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const deps = c.get("deps");
    const integrations = requireModule(deps.store, "integrations");
    const dest = (await integrations.listDestinations(access.project.id)).find((d) => d.provider === prov.data);
    const conn = dest && (await integrations.getConnection(dest.connectionId));
    if (!dest || !conn) return c.json({ error: `No ${PROVIDER_NAME[prov.data]} destination to test` }, 404);
    const result = await sendTicket(deps, dest, conn, testTicket(deps.options.dashboardOrigin, access.project));
    if (!result.ok) return c.json({ error: result.error }, 502);
    return c.json({ externalId: result.externalId, url: result.url });
  })
  .delete("/:id/destinations/:provider", async (c) => {
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    await requireModule(c.get("store"), "integrations").deleteDestination(access.project.id, prov.data);
    return c.json({ ok: true });
  });
