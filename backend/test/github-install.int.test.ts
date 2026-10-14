import { createHmac, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { stored } from "./harness.ts";
import { verify } from "../src/lib/signed.ts";
import { fakeGithub } from "./github-fake.ts";
import { testEnv } from "./env.ts";
import { authCookie, makeConnection, makeDestination, makeProject, makeUser, teamOf } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function startInstall(userId: string, projectId: string) {
  const res = await app.request("/api/integrations/github/install", {
    method: "POST",
    headers: { cookie: await authCookie(userId), "content-type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  return res;
}

async function stateFor(userId: string, projectId: string) {
  const { url } = (await (await startInstall(userId, projectId)).json()) as { url: string };
  return new URL(url).searchParams.get("state")!;
}

function callback(cookie: string, params: Record<string, string>) {
  return app.request(`/api/integrations/github/callback?${new URLSearchParams(params)}`, {
    headers: { cookie },
  });
}

describe("GET /api/integrations", () => {
  it("reports GitHub as available and lists only the team's connections", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await makeConnection(me.id, "1", "acme");
    await makeConnection(other.id, "2", "evil");
    const cookie = await authCookie(me.id);

    const res = await app.request(`/api/integrations?teamId=${await teamOf(me.id)}`, { headers: { cookie } });
    const body = (await res.json()) as { github: { available: boolean }; connections: { label: string }[] };
    expect(body.github.available).toBe(true);
    expect(body.connections.map((c) => c.label)).toEqual(["acme"]);

    expect((await app.request("/api/integrations", { headers: { cookie } })).status).toBe(400);
    const theirs = await app.request(`/api/integrations?teamId=${await teamOf(other.id)}`, { headers: { cookie } });
    expect(theirs.status).toBe(404);
  });
});

describe("GitHub App install round-trip", () => {
  it("builds the install URL with a signed state for the caller's project", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);

    const res = await startInstall(me.id, project.id);
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://github.com/apps/brainbox-test/installations/new");
    expect(JSON.parse(verify(url.searchParams.get("state")!, testEnv.AUTH_SECRET!)!)).toMatchObject({
      uid: me.id,
      projectId: project.id,
    });

    const other = await makeUser();
    expect((await startInstall(other.id, project.id)).status).toBe(404);
  });

  it("verifies the install through the user's OAuth code and stores the connection", async () => {
    const gh = fakeGithub({ userInstallationIds: [7, 4242] });
    const me = await makeUser();
    const project = await makeProject(me.id);
    const cookie = await authCookie(me.id);
    const state = await stateFor(me.id, project.id);

    const res = await callback(cookie, { installation_id: "4242", code: "good-code", state, setup_action: "install" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `${testEnv.DASHBOARD_ORIGIN ?? "http://localhost:5173"}/projects/${project.id}/settings?github=connected`,
    );
    const rows = await stored.connections(await teamOf(me.id));
    expect(rows).toMatchObject([{ provider: "github", externalId: "4242", label: "acme" }]);

    await callback(cookie, { installation_id: "4242", code: "good-code", state });
    expect(await stored.connections()).toHaveLength(1);
    expect(gh.calls.some((c) => c.path.startsWith("/user/installations"))).toBe(true);
  });

  it("refuses an installation the user cannot see, and a bad code", async () => {
    fakeGithub({ userInstallationIds: [7] });
    const me = await makeUser();
    const project = await makeProject(me.id);
    const cookie = await authCookie(me.id);
    const state = await stateFor(me.id, project.id);

    const notMine = await callback(cookie, { installation_id: "4242", code: "good-code", state });
    expect(notMine.headers.get("location")).toContain("?github=error");
    const badCode = await callback(cookie, { installation_id: "7", code: "nope", state });
    expect(badCode.headers.get("location")).toContain("?github=error");
    const noCode = await callback(cookie, { installation_id: "7", state });
    expect(noCode.headers.get("location")).toContain("?github=error");
    expect(await stored.connections()).toEqual([]);
  });

  it("400s a forged state and another user's state", async () => {
    fakeGithub();
    const me = await makeUser();
    const other = await makeUser();
    const project = await makeProject(me.id);
    const state = await stateFor(me.id, project.id);
    const params = { installation_id: "4242", code: "good-code" };

    expect((await callback(await authCookie(me.id), { ...params, state: `${state}x` })).status).toBe(400);
    expect((await callback(await authCookie(other.id), { ...params, state })).status).toBe(400);
  });
});

describe("connections", () => {
  it("lists the installation's repos for the owner only", async () => {
    fakeGithub();
    const me = await makeUser();
    const other = await makeUser();
    const conn = await makeConnection(me.id);

    const res = await app.request(`/api/integrations/connections/${conn.id}/repos`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(await res.json()).toEqual([{ owner: "acme", name: "web", fullName: "acme/web", private: true }]);

    const foreign = await app.request(`/api/integrations/connections/${conn.id}/repos`, {
      headers: { cookie: await authCookie(other.id) },
    });
    expect(foreign.status).toBe(404);
  });

  it("disconnecting removes the destinations that use it", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    const conn = await makeConnection(me.id);
    await makeDestination(project.id, conn.id);

    const res = await app.request(`/api/integrations/connections/${conn.id}`, {
      method: "DELETE",
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
    expect(await stored.destinations()).toEqual([]);
  });
});

describe("POST /webhooks/github", () => {
  const secret = testEnv.GITHUB_WEBHOOK_SECRET!;
  function send(body: object, opts: { event?: string; id?: string; secret?: string } = {}) {
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", opts.secret ?? secret).update(raw).digest("hex");
    return app.request("/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": opts.event ?? "installation",
        "x-github-delivery": opts.id ?? randomUUID(),
        "x-hub-signature-256": `sha256=${sig}`,
      },
      body: raw,
    });
  }

  it("rejects a bad signature", async () => {
    expect((await send({ action: "deleted" }, { secret: "wrong" })).status).toBe(400);
  });

  it("removes every account's connection to an uninstalled app, once", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const project = await makeProject(a.id);
    const connA = await makeConnection(a.id, "4242");
    await makeConnection(b.id, "4242");
    await makeConnection(b.id, "5555");
    await makeDestination(project.id, connA.id);

    const id = randomUUID();
    const res = await send({ action: "deleted", installation: { id: 4242 } }, { id });
    expect(await res.json()).toEqual({ received: true });
    const left = await stored.connections();
    expect(left.map((c) => c.externalId)).toEqual(["5555"]);
    expect(await stored.destinations()).toEqual([]);

    const again = await send({ action: "deleted", installation: { id: 4242 } }, { id });
    expect(await again.json()).toEqual({ received: true, duplicate: true });
  });

  it("acknowledges and ignores other events", async () => {
    const me = await makeUser();
    await makeConnection(me.id, "4242");
    const res = await send({ action: "added", installation: { id: 4242 } }, { event: "installation_repositories" });
    expect(res.status).toBe(200);
    expect(await stored.connections()).toHaveLength(1);
  });
});
