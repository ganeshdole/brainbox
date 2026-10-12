import { GithubApiError } from "@ganeshdole/brainbox-integrations";
import type { IntegrationRepo } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";
import { z } from "zod";

import { env } from "../env.ts";
import { getGithubApp, integrationsConfigured } from "../integrations/registry.ts";
import { toConnection } from "../lib/serialize.ts";
import { sign, verify } from "../lib/signed.ts";
import type { AppEnv } from "../types.ts";

const STATE_TTL_MS = 15 * 60 * 1000;

const installSchema = z.object({ projectId: z.string().min(1) });

const stateSchema = z.object({
  uid: z.string(),
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
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const rows = await c.get("store").integrations.listConnections(uid);
    return c.json({
      github: { available: integrationsConfigured("github") },
      connections: rows.map(toConnection),
    });
  })
  .post("/github/install", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    if (!integrationsConfigured("github")) {
      return c.json({ error: "GitHub is not configured on this deployment" }, 503);
    }
    const parsed = installSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const proj = await c.get("store").projects.get(parsed.data.projectId);
    if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    const state = sign(JSON.stringify({ uid, projectId: proj.id, exp: Date.now() + STATE_TTL_MS }));
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

    try {
      const github = getGithubApp();
      const userToken = await github.userToken(code);
      const mine = (await github.userInstallations(userToken)).find(
        (i) => String(i.id) === installationId,
      );
      if (!mine) return back("error");
      await c.get("store").integrations.saveConnection({
        ownerId: uid,
        provider: "github",
        externalId: installationId,
        label: mine.account.login,
      });
    } catch (err) {
      console.error("[integrations] GitHub install callback failed:", err);
      return back("error");
    }
    return back("connected");
  })
  .get("/connections/:id/repos", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const conn = await c.get("store").integrations.getConnection(c.req.param("id"));
    if (!conn || conn.ownerId !== uid) return c.json({ error: "Not found" }, 404);
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
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const conn = await store.integrations.getConnection(c.req.param("id"));
    if (!conn || conn.ownerId !== uid) return c.json({ error: "Not found" }, 404);
    await store.integrations.deleteConnection(conn.id);
    return c.json({ ok: true });
  });
