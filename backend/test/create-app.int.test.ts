import type { CreatedInvite, Me, Project } from "@ganeshdole/brainbox-shared";
import { describe, expect, it } from "vitest";

import { createApp, type AppDeps } from "../src/create-app.ts";
import { fromEnv } from "../src/from-env.ts";
import { publicFileUrl } from "../src/lib/public-files.ts";
import type { Storage } from "../src/storage/types.ts";
import { getStore } from "../src/store/index.ts";
import type { ProjectRecord, Store, StoreModule } from "../src/store/types.ts";
import { authCookie, makeIssue, makeProject, makeTeam, makeUser } from "./helpers.ts";
import { stored } from "./harness.ts";

// createApp() serves what its parts allow: a route for an optional store
// module mounts only when the store has it, sign-in only with `auth`, the
// paywall only with `billing`. These build apps from the env's parts with
// some taken away. The stores below are the real one with modules left out.

/** The test store with only the core and `modules`. */
function storeWith(...modules: StoreModule[]): Store {
  const full = getStore();
  return {
    projects: full.projects,
    issues: full.issues,
    ...Object.fromEntries(modules.map((name) => [name, full[name]])),
  };
}

function build(over: Partial<AppDeps>) {
  return createApp({ ...fromEnv(), ...over });
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function report(projectKey: string) {
  const fd = new FormData();
  fd.append(
    "json",
    JSON.stringify({
      projectKey,
      text: "broken",
      metadata: {
        url: "http://host/app",
        title: "App",
        viewport: { width: 800, height: 600 },
        devicePixelRatio: 1,
        userAgent: "UA",
        language: "en",
        timezone: "UTC",
        consoleErrors: [],
      },
    }),
  );
  fd.append("screenshot", new File([PNG], "s.png", { type: "image/png" }));
  return fd;
}

describe("a core-only store, without sign-in", () => {
  const { auth: _auth, billing: _billing, ...parts } = fromEnv();
  const app = createApp({ ...parts, store: storeWith() });

  it("receives reports", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);

    const res = await app.request("/ingest", { method: "POST", body: report(project.key) });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await stored.issues(id))[0]).toMatchObject({ projectId: project.id, text: "broken" });
  });

  it("answers health and public file links", async () => {
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/f/nonsense")).status).toBe(404);
  });

  it("serves no dashboard API, waitlist or webhooks", async () => {
    const me = await makeUser();
    const cookie = await authCookie(me.id);
    for (const path of ["/api/projects", "/api/me", "/api/sign-in-options"]) {
      expect((await app.request(path, { headers: { cookie } })).status, path).toBe(404);
    }
    for (const path of ["/waitlist", "/webhooks/dodo", "/webhooks/github"]) {
      expect((await app.request(path, { method: "POST" })).status, path).toBe(404);
    }
  });
});

describe("optional modules", () => {
  it("lists every module on /api/me when the store has them all", async () => {
    const me = await makeUser();
    const res = await build({}).request("/api/me", { headers: { cookie: await authCookie(me.id) } });
    const body = (await res.json()) as Me;
    expect(body.modules).toEqual(["teams", "triage", "features", "integrations", "billing"]);
  });

  it("mounts only the routes of the modules the store has", async () => {
    const app = build({ store: storeWith("auth", "teams", "billing") });
    const me = await makeUser();
    const cookie = await authCookie(me.id);
    const project = await makeProject(me.id);
    const issue = await makeIssue(project.id);

    const meRes = await app.request("/api/me", { headers: { cookie } });
    expect(((await meRes.json()) as Me).modules).toEqual(["teams", "billing"]);

    // The core still reads, with no deliveries to show.
    const read = await app.request(`/api/issues/${issue.id}`, { headers: { cookie } });
    expect(read.status).toBe(200);
    expect(await read.json()).not.toHaveProperty("deliveries");
    expect((await app.request(`/api/projects/${project.id}/issues`, { headers: { cookie } })).status).toBe(200);

    const json = { cookie, "content-type": "application/json" };
    const gone: Array<[string, string]> = [
      ["PATCH", `/api/issues/${issue.id}`],
      ["GET", `/api/issues/${issue.id}/activity`],
      ["PUT", `/api/issues/${issue.id}/feature`],
      ["POST", `/api/issues/${issue.id}/deliveries`],
      ["GET", `/api/projects/${project.id}/features`],
      ["GET", `/api/projects/${project.id}/destinations`],
      ["GET", `/api/integrations?teamId=${project.teamId}`],
    ];
    for (const [method, path] of gone) {
      const res = await app.request(path, { method, headers: json, body: method === "GET" ? undefined : "{}" });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("delivers nothing after ingest without the integrations module", async () => {
    const app = build({ store: storeWith("auth", "teams"), billing: undefined });
    const me = await makeUser();
    const project = await makeProject(me.id);
    const res = await app.request("/ingest", { method: "POST", body: report(project.key) });
    const { id } = (await res.json()) as { id: string };
    expect(await stored.deliveries(id)).toEqual([]);
  });

  it("has no paywall without billing", async () => {
    const app = build({ billing: undefined });
    const me = await makeUser(undefined, { subscribed: false });
    const cookie = await authCookie(me.id);
    expect((await app.request("/api/projects", { headers: { cookie } })).status).toBe(200);
    expect((await app.request("/api/billing/subscription", { headers: { cookie } })).status).toBe(404);
    const body = (await (await app.request("/api/me", { headers: { cookie } })).json()) as Me;
    expect(body.modules).not.toContain("billing");
  });
});

/** Projects in memory, with no Team behind `teamId`: what a store without
 *  teams keeps. (Postgres's projects need a real Team.) */
function projectsInMemory(): Store["projects"] {
  const rows: ProjectRecord[] = [];
  return {
    listForTeams: async (teamIds) =>
      rows.filter((p) => teamIds.includes(p.teamId)).map((p) => ({ ...p, issueCount: 0, featureRequestCount: 0 })),
    create: async (input) => {
      const row = { ...input, id: crypto.randomUUID(), createdAt: new Date() };
      rows.unshift(row);
      return row;
    },
    get: async (id) => rows.find((p) => p.id === id) ?? null,
    getByKey: async (key) => rows.find((p) => p.key === key) ?? null,
    update: async () => null,
    delete: async () => {},
  };
}

describe("a store without teams", () => {
  const domains = { ...fromEnv().auth, allowedEmailDomains: ["acme.test"] };

  it("needs sign-in limited to known domains", () => {
    expect(() => build({ store: storeWith("auth") })).toThrow(/allowedEmailDomains/);
  });

  it("puts every project in one Team that everyone signed in owns", async () => {
    const projects = projectsInMemory();
    const app = build({ store: { ...storeWith("auth", "billing"), projects }, auth: domains });
    const [ana, ben] = [await makeUser("ana@acme.test"), await makeUser("ben@acme.test")];
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await authCookie(ana.id, "ana@acme.test") },
      body: JSON.stringify({ name: "Shop" }),
    });
    expect(created.status).toBe(201);
    const project = (await created.json()) as Project;
    expect(project.team).toEqual({ id: "everyone", name: "Everyone", role: "owner" });

    const listed = await app.request("/api/projects", {
      headers: { cookie: await authCookie(ben.id, "ben@acme.test") },
    });
    expect(((await listed.json()) as Project[]).map((p) => p.id)).toEqual([project.id]);

    // A project of any other Team stays out of reach.
    const other = await projects.create({ teamId: "t-elsewhere", name: "Theirs", key: "pk_theirs", allowedOrigins: [] });
    const res = await app.request(`/api/projects/${other.id}`, {
      headers: { cookie: await authCookie(ben.id, "ben@acme.test") },
    });
    expect(res.status).toBe(404);
    expect((await app.request("/api/teams", { headers: { cookie: await authCookie(ben.id) } })).status).toBe(404);
  });
});

describe("sign-in", () => {
  it("offers Google only with a client for it", async () => {
    const { google: _google, ...withoutGoogle } = fromEnv().auth ?? {};
    const options = async (app: ReturnType<typeof build>) => (await app.request("/api/sign-in-options")).json();
    const providers = async (app: ReturnType<typeof build>) =>
      Object.keys((await (await app.request("/api/auth/providers")).json()) as object);

    const emailOnly = build({ auth: withoutGoogle });
    expect(await options(emailOnly)).toEqual({ email: "both", google: false });
    expect(await providers(emailOnly)).toEqual(["magic-link"]);

    const both = build({});
    expect(await options(both)).toEqual({ email: "both", google: true });
    expect(await providers(both)).toEqual(["google", "magic-link"]);

    const googleOnly = build({ auth: { ...fromEnv().auth, emailMode: "off" } });
    expect(await options(googleOnly)).toEqual({ email: "off", google: true });
    expect(await providers(googleOnly)).toEqual(["google"]);
  });

  it("refuses email sign-in off without Google, which would let no one in", () => {
    const { google: _google, ...withoutGoogle } = fromEnv().auth ?? {};
    expect(() => build({ auth: { ...withoutGoogle, emailMode: "off" } })).toThrow(/needs Google/);
  });
});

describe("createApp", () => {
  it("refuses sign-in or billing the store has no module for", () => {
    expect(() => build({ store: storeWith("teams", "billing") })).toThrow(/auth module/);
    expect(() => build({ store: storeWith("auth", "teams"), billing: undefined })).not.toThrow();
    expect(() => build({ store: storeWith("auth", "teams") })).toThrow(/billing module/);
  });

  it("builds apps that share nothing", async () => {
    const storage = (host: string): Storage => ({
      put: async () => {},
      presignGet: async (key) => `https://${host}/${key}`,
    });
    const base = fromEnv();
    const one = createApp({ ...base, storage: storage("one.example"), options: { ...base.options, secret: "one" } });
    const two = createApp({ ...base, storage: storage("two.example"), options: { ...base.options, secret: "two" } });

    const link = new URL(publicFileUrl({ publicUrl: "http://api", secret: "one" }, "p/i/screenshot.png"));
    const res = await one.request(link.pathname);
    expect(res.headers.get("location")).toBe("https://one.example/p/i/screenshot.png");
    // Signed with the other app's secret: no such file.
    expect((await two.request(link.pathname)).status).toBe(404);
  });

  it("says an invite was emailed when the emailer sent it", async () => {
    const app = build({ emailer: { send: async () => ({ id: "msg_1" }) } });
    const me = await makeUser();
    const team = await makeTeam(me.id);
    const res = await app.request(`/api/teams/${team.id}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await authCookie(me.id) },
      body: JSON.stringify({ email: "new@acme.test", role: "member" }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as CreatedInvite).emailed).toBe(true);
  });
});
