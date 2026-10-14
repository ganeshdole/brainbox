import type { ProjectTeam } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";
import { z } from "zod";

import { prepareDestination } from "../integrations/azure-devops.ts";
import { sendTicket, testTicket } from "../integrations/dispatch.ts";
import { integrationsConfigured, PROVIDER_NAME } from "../integrations/registry.ts";
import { projectAccess, teamAccess, type TeamAccess } from "../lib/access.ts";
import { billingStateFor, teamHasAccess } from "../lib/billing.ts";
import { generateProjectKey } from "../lib/projectKey.ts";
import { toDestination, toIssue, toProject } from "../lib/serialize.ts";
import { defaultTeamName } from "../lib/teams.ts";
import { getStorage } from "../storage/index.ts";
import type { AppEnv } from "../types.ts";

// An origin as browsers send it: scheme + host (+ optional port), no path.
const origin = z
  .string()
  .max(300)
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, "must be an origin like https://app.example.com");

const createSchema = z.object({
  name: z.string().min(1).max(100),
  teamId: z.string().min(1).optional(),
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

export const projectsRoute = new Hono<AppEnv>()
  // Every project in every Team the caller belongs to, leaving out Teams
  // whose plan has lapsed: opening one would only meet the paywall.
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const teams = [];
    for (const team of await store.teams.listForUser(uid)) {
      if (await teamHasAccess(store, team.id)) teams.push(team);
    }
    const byId = new Map(teams.map((t) => [t.id, t]));
    const rows = await store.projects.listForTeams(teams.map((t) => t.id));
    return c.json(
      rows.flatMap((r) => {
        const team = byId.get(r.teamId);
        if (!team) return [];
        const project = toProject(r, { id: team.id, name: team.name, role: team.role });
        return [{ ...project, issueCount: r.issueCount, featureRequestCount: r.featureRequestCount }];
      }),
    );
  })
  // Into `teamId` when given. Without it, into the Team the caller owns, or a
  // new one for them when they own none: their first project is how an
  // Account comes to have a Team.
  .post("/", async (c) => {
    const token = c.get("authUser").token;
    const uid = token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const store = c.get("store");
    const teamId =
      parsed.data.teamId ?? (await store.teams.listForUser(uid)).find((t) => t.role === "owner")?.id;
    let team: ProjectTeam;
    if (teamId) {
      const access = await teamAccess(c, teamId, "admin");
      if (access instanceof Response) return access;
      team = { id: access.team.id, name: access.team.name, role: access.role };
    } else {
      // Paid for by the caller's own plan, not by a Team they are only in.
      if (!(await billingStateFor(store, uid, token?.email)).hasAccess) {
        return c.json({ error: "Subscription required", code: "subscription_required" }, 402);
      }
      const created = await store.teams.create({
        name: defaultTeamName(token?.name, token?.email),
        ownerId: uid,
      });
      team = { id: created.id, name: created.name, role: "owner" };
    }
    const row = await store.projects.create({
      teamId: team.id,
      name: parsed.data.name,
      key: generateProjectKey(),
      allowedOrigins: parsed.data.allowedOrigins ?? [],
    });
    return c.json(toProject(row, team), 201);
  })
  .patch("/:id", async (c) => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const row = await c.get("store").projects.update(access.project.id, parsed.data);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row, teamOf(access)));
  })
  .get("/:id", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    return c.json(toProject(access.project, teamOf(access)));
  })
  .delete("/:id", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    // Issues go with it; stored media is orphaned for now (the Storage
    // interface has no delete yet).
    await c.get("store").projects.delete(access.project.id);
    return c.json({ ok: true });
  })
  .get("/:id/issues", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    const rows = await c.get("store").issues.listForProject(access.project.id);
    const storage = getStorage();
    return c.json(await Promise.all(rows.map((r) => toIssue(r, storage))));
  })
  .get("/:id/destinations", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    const rows = await c.get("store").integrations.listDestinations(access.project.id);
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
    const store = c.get("store");
    const conn = await store.integrations.getConnection(input.connectionId);
    if (!conn || conn.teamId !== access.project.teamId || conn.provider !== input.provider) {
      return c.json({ error: "Connection not found" }, 404);
    }
    const common = { projectId: access.project.id, connectionId: conn.id, enabled: input.enabled };

    if (input.provider === "github") {
      const row = await store.integrations.saveDestination({ ...common, provider: "github", config: input.config });
      return c.json(toDestination(row));
    }
    if (!integrationsConfigured("azure-devops")) {
      return c.json({ error: "Azure DevOps is not configured on this deployment" }, 503);
    }
    if (conn.status === "needs_reauth") return c.json(REJECTED, 409);
    const prepared = await prepareDestination(conn, input.config);
    if (!prepared.ok) {
      if (!prepared.rejected) return c.json({ error: prepared.error }, prepared.status);
      await store.integrations.setConnectionStatus(conn.id, "needs_reauth");
      return c.json(REJECTED, 409);
    }
    const row = await store.integrations.saveDestination({
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
    const store = c.get("store");
    const dest = (await store.integrations.listDestinations(access.project.id)).find((d) => d.provider === prov.data);
    const conn = dest && (await store.integrations.getConnection(dest.connectionId));
    if (!dest || !conn) return c.json({ error: `No ${PROVIDER_NAME[prov.data]} destination to test` }, 404);
    const result = await sendTicket(store, dest, conn, testTicket(access.project));
    if (!result.ok) return c.json({ error: result.error }, 502);
    return c.json({ externalId: result.externalId, url: result.url });
  })
  .delete("/:id/destinations/:provider", async (c) => {
    const prov = provider.safeParse(c.req.param("provider"));
    if (!prov.success) return c.json({ error: "Unknown provider" }, 404);
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    await c.get("store").integrations.deleteDestination(access.project.id, prov.data);
    return c.json({ ok: true });
  });

function teamOf({ team, role }: TeamAccess): ProjectTeam {
  return { id: team.id, name: team.name, role };
}
