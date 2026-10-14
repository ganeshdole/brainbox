import { AzureDevopsApiError, GithubApiError, type AzureDevopsCatalog } from "@ganeshdole/brainbox-integrations";
import type { IntegrationRepo } from "@ganeshdole/brainbox-shared";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { env } from "../env.ts";
import {
  authFor,
  catalogFor,
  organizationOf,
  parseOrganization,
  patExternalId,
  sealToken,
} from "../integrations/azure-devops.ts";
import { getGithubApp, integrationsConfigured } from "../integrations/registry.ts";
import { projectAccess, teamAccess } from "../lib/access.ts";
import { toConnection } from "../lib/serialize.ts";
import { sign, verify } from "../lib/signed.ts";
import type { AppEnv } from "../types.ts";

const STATE_TTL_MS = 15 * 60 * 1000;

const installSchema = z.object({ projectId: z.string().min(1) });

const patSchema = z.object({
  teamId: z.string().min(1),
  /** The organization's URL as pasted, or its name. */
  organization: z.string().min(1).max(300),
  token: z.string().trim().min(1).max(500),
});

const ADO_UNAVAILABLE = "Azure DevOps is not configured on this deployment";
const ADO_REJECTED = "Azure DevOps rejected the token. Connect Azure DevOps again with a new one.";

/**
 * An Azure DevOps connection the caller administers, with a catalog that
 * calls Azure DevOps as it; otherwise the response to send. A connection
 * whose token was rejected answers 409 until it is connected again.
 */
async function azureDevopsConnection(
  c: Context<AppEnv>,
): Promise<{ catalog: AzureDevopsCatalog; organization: string; markRejected: () => Promise<void> } | Response> {
  const store = c.get("store");
  const conn = await store.integrations.getConnection(c.req.param("id") ?? "");
  if (!conn || conn.provider !== "azure-devops") return c.json({ error: "Not found" }, 404);
  const access = await teamAccess(c, conn.teamId, "admin");
  if (access instanceof Response) return access;
  if (!integrationsConfigured("azure-devops")) return c.json({ error: ADO_UNAVAILABLE }, 503);
  if (conn.status === "needs_reauth") return c.json({ error: ADO_REJECTED, code: "needs_reauth" }, 409);
  return {
    catalog: catalogFor(await authFor(conn)),
    organization: organizationOf(conn),
    markRejected: () => store.integrations.setConnectionStatus(conn.id, "needs_reauth"),
  };
}

/** One catalog lookup as a response: Azure DevOps' own message on failure,
 *  and a rejected token marks the connection. Never a 401, which the
 *  dashboard reads as its own session ending. */
async function lookup<T>(
  c: Context<AppEnv>,
  run: (catalog: AzureDevopsCatalog, organization: string) => Promise<T>,
): Promise<Response> {
  const conn = await azureDevopsConnection(c);
  if (conn instanceof Response) return conn;
  try {
    return c.json(await run(conn.catalog, conn.organization));
  } catch (err) {
    if (!(err instanceof AzureDevopsApiError)) throw err;
    if (err.status === 401) {
      await conn.markRejected();
      return c.json({ error: ADO_REJECTED, code: "needs_reauth" }, 409);
    }
    return c.json({ error: err.message }, err.status === 404 ? 404 : 502);
  }
}

const stateSchema = z.object({
  uid: z.string(),
  teamId: z.string(),
  projectId: z.string(),
  exp: z.number(),
});

function readState(token: string | undefined): z.infer<typeof stateSchema> | null {
  const raw = token ? verify(token) : null;
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.exp > Date.now() ? parsed.data : null;
  } catch {
    return null;
  }
}

export const integrationsRoute = new Hono<AppEnv>()
  // A Team's connections: ?teamId= names the Team.
  .get("/", async (c) => {
    const teamId = c.req.query("teamId");
    if (!teamId) return c.json({ error: "teamId is required" }, 400);
    const access = await teamAccess(c, teamId, "member");
    if (access instanceof Response) return access;
    const rows = await c.get("store").integrations.listConnections(access.team.id);
    return c.json({
      github: { available: integrationsConfigured("github") },
      azureDevops: { available: integrationsConfigured("azure-devops") },
      connections: rows.map(toConnection),
    });
  })
  .post("/github/install", async (c) => {
    if (!integrationsConfigured("github")) {
      return c.json({ error: "GitHub is not configured on this deployment" }, 503);
    }
    const parsed = installSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const access = await projectAccess(c, parsed.data.projectId, "admin");
    if (access instanceof Response) return access;
    const state = sign(
      JSON.stringify({
        uid: access.uid,
        teamId: access.project.teamId,
        projectId: access.project.id,
        exp: Date.now() + STATE_TTL_MS,
      }),
    );
    const url = new URL(`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`);
    url.searchParams.set("state", state);
    return c.json({ url: url.toString() });
  })
  // GitHub redirects the browser here after an install. installation_id is
  // attacker-controllable; the OAuth code proves the user can see it.
  .get("/github/callback", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const state = readState(c.req.query("state"));
    if (!state || state.uid !== uid) return c.json({ error: "Invalid state" }, 400);

    const back = (result: "connected" | "error") =>
      c.redirect(`${env.DASHBOARD_ORIGIN}/projects/${state.projectId}/settings?github=${result}`, 302);

    const installationId = c.req.query("installation_id") ?? "";
    const code = c.req.query("code");
    if (!/^\d+$/.test(installationId) || !code) return back("error");
    // Still an admin of the Team: a role can change while GitHub is open.
    if ((await teamAccess(c, state.teamId, "admin")) instanceof Response) return back("error");

    try {
      const github = getGithubApp();
      const userToken = await github.userToken(code);
      const mine = (await github.userInstallations(userToken)).find(
        (i) => String(i.id) === installationId,
      );
      if (!mine) return back("error");
      await c.get("store").integrations.saveConnection({
        teamId: state.teamId,
        provider: "github",
        externalId: installationId,
        label: mine.account.login,
        auth: "app",
        credentials: null,
      });
    } catch (err) {
      console.error("[integrations] GitHub install callback failed:", err);
      return back("error");
    }
    return back("connected");
  })
  // Connect (or reconnect) an organization with a personal access token. The
  // token is tried first: listing projects needs "Project and Team (Read)".
  .post("/azure-devops/pat", async (c) => {
    if (!integrationsConfigured("azure-devops")) return c.json({ error: ADO_UNAVAILABLE }, 503);
    const parsed = patSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const access = await teamAccess(c, parsed.data.teamId, "admin");
    if (access instanceof Response) return access;
    const organization = parseOrganization(parsed.data.organization);
    if (!organization) {
      return c.json({ error: "Enter the organization's URL, like https://dev.azure.com/acme" }, 400);
    }
    const token = parsed.data.token;
    try {
      await catalogFor({ pat: token }).projects(organization);
    } catch (err) {
      if (!(err instanceof AzureDevopsApiError)) throw err;
      const error =
        err.status === 401
          ? "Azure DevOps rejected the token. Check it hasn't expired, belongs to this organization, and has Work Items (Read & write) and Project and Team (Read)."
          : err.status === 404
            ? `There's no Azure DevOps organization called ${organization}.`
            : err.message;
      return c.json({ error }, err.status === 401 || err.status === 404 ? 400 : 502);
    }
    const identity = { teamId: access.team.id, provider: "azure-devops" as const, externalId: patExternalId(organization) };
    const row = await c.get("store").integrations.saveConnection({
      ...identity,
      label: organization,
      auth: "pat",
      credentials: await sealToken(identity, token),
    });
    return c.json(toConnection(row), 201);
  })
  // What an Azure DevOps connection offers the destination pickers, each
  // step narrowed by the one before: project, then its teams and types.
  .get("/connections/:id/projects", (c) => lookup(c, (catalog, org) => catalog.projects(org)))
  .get("/connections/:id/teams", (c) => {
    const { project } = c.req.query();
    if (!project) return c.json({ error: "project is required" }, 400);
    return lookup(c, (catalog, org) => catalog.teams(org, project));
  })
  .get("/connections/:id/team", (c) => {
    const { project, projectName, team } = c.req.query();
    if (!project || !projectName || !team) return c.json({ error: "project, projectName and team are required" }, 400);
    return lookup(c, (catalog, org) => catalog.teamSettings(org, { id: project, name: projectName }, team));
  })
  .get("/connections/:id/work-item-types", (c) => {
    const { project } = c.req.query();
    if (!project) return c.json({ error: "project is required" }, 400);
    return lookup(c, (catalog, org) => catalog.workItemTypes(org, project));
  })
  .get("/connections/:id/work-item-type", (c) => {
    const { project, type } = c.req.query();
    if (!project || !type) return c.json({ error: "project and type are required" }, 400);
    return lookup(c, (catalog, org) => catalog.workItemType(org, project, type));
  })
  .get("/connections/:id/repos", async (c) => {
    const conn = await c.get("store").integrations.getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const access = await teamAccess(c, conn.teamId, "admin");
    if (access instanceof Response) return access;
    if (conn.provider !== "github") return c.json({ error: "Not found" }, 404);
    if (!integrationsConfigured(conn.provider)) {
      return c.json({ error: "GitHub is not configured on this deployment" }, 503);
    }
    try {
      const repos = await getGithubApp().installationRepos(conn.externalId);
      return c.json(
        repos.map(
          (r): IntegrationRepo => ({ owner: r.owner, name: r.name, fullName: r.fullName, private: r.private }),
        ),
      );
    } catch (err) {
      console.error("[integrations] listing repos failed:", err);
      const message = err instanceof GithubApiError ? err.message : "GitHub request failed";
      return c.json({ error: message }, 502);
    }
  })
  .delete("/connections/:id", async (c) => {
    const store = c.get("store");
    const conn = await store.integrations.getConnection(c.req.param("id"));
    if (!conn) return c.json({ error: "Not found" }, 404);
    const access = await teamAccess(c, conn.teamId, "admin");
    if (access instanceof Response) return access;
    await store.integrations.deleteConnection(conn.id);
    return c.json({ ok: true });
  });
