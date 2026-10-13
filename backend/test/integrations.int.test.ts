import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { stored } from "./harness.ts";
import { deliverIssue } from "../src/integrations/dispatch.ts";
import { getStore } from "../src/store/index.ts";
import { publicFileUrl } from "../src/lib/public-files.ts";
import { getStorage } from "../src/storage/index.ts";
import { fakeGithub } from "./github-fake.ts";
import {
  authCookie,
  makeConnection,
  makeDestination,
  makeIssue,
  makeProject,
  makeTeamProject,
  makeUser,
} from "./helpers.ts";

const { transcribeAudioMock, transcriptionEnabledMock } = vi.hoisted(() => ({
  transcribeAudioMock: vi.fn<(audio: Uint8Array) => Promise<string>>(),
  transcriptionEnabledMock: vi.fn(() => false),
}));
vi.mock("../src/lib/transcription.ts", () => ({
  transcribeAudio: transcribeAudioMock,
  transcriptionEnabled: transcriptionEnabledMock,
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

beforeEach(() => {
  transcribeAudioMock.mockReset();
  transcriptionEnabledMock.mockReset();
  transcriptionEnabledMock.mockReturnValue(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function ingestForm(projectKey: string, extra?: (fd: FormData) => void) {
  const fd = new FormData();
  fd.append(
    "json",
    JSON.stringify({
      projectKey,
      text: "Save button does nothing",
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
  extra?.(fd);
  return fd;
}

async function settled(issueId: string, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await stored.deliveries(issueId);
    if (rows.length > 0 && rows.every((r) => r.status !== "pending")) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`delivery for ${issueId} did not settle`);
}

async function setup() {
  const me = await makeUser();
  const project = await makeProject(me.id);
  const conn = await makeConnection(me.id);
  return { me, project, conn };
}

describe("delivery after ingest", () => {
  it("opens a GitHub issue for a project with a destination", async () => {
    const gh = fakeGithub();
    const { project, conn } = await setup();
    await makeDestination(project.id, conn.id, {
      config: { owner: "acme", repo: "web", labels: ["feedback"] },
    });

    const res = await app.request("/ingest", { method: "POST", body: ingestForm(project.key) });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const [row] = await settled(id);
    expect(row).toMatchObject({
      status: "sent",
      provider: "github",
      externalId: "1",
      externalUrl: "https://github.com/acme/web/issues/1",
      error: null,
      attempts: 1,
    });

    const [call] = gh.issueCalls();
    expect(call?.path).toBe("/repos/acme/web/issues");
    const sent = call?.body as { title: string; body: string; labels: string[] };
    expect(sent.title).toBe("Save button does nothing");
    expect(sent.labels).toEqual(["feedback"]);
    expect(sent.body).toContain("http://localhost:8787/f/");
    expect(sent.body).toContain(`/projects/${project.id}/issues/${id}`);
  });

  it("waits for transcription so the ticket carries the transcript", async () => {
    const gh = fakeGithub();
    transcriptionEnabledMock.mockReturnValue(true);
    transcribeAudioMock.mockImplementation(
      () => new Promise((r) => setTimeout(() => r("checkout crashes on submit"), 50)),
    );
    const { project, conn } = await setup();
    await makeDestination(project.id, conn.id);

    const res = await app.request("/ingest", {
      method: "POST",
      body: ingestForm(project.key, (fd) =>
        fd.append("audio", new File([new Uint8Array([1, 2])], "a.webm", { type: "audio/webm" })),
      ),
    });
    const { id } = (await res.json()) as { id: string };
    await settled(id);

    const body = (gh.issueCalls()[0]?.body as { body: string }).body;
    expect(body).toContain("> checkout crashes on submit");
  });

  it("does nothing for a project without a destination, or with it paused", async () => {
    const gh = fakeGithub();
    const { project, conn } = await setup();
    const res = await app.request("/ingest", { method: "POST", body: ingestForm(project.key) });
    const { id } = (await res.json()) as { id: string };

    const other = await makeTeamProject(project.teamId);
    await makeDestination(other.id, conn.id, { enabled: false });
    const res2 = await app.request("/ingest", { method: "POST", body: ingestForm(other.key) });
    const { id: id2 } = (await res2.json()) as { id: string };

    await new Promise((r) => setTimeout(r, 100));
    expect(gh.issueCalls()).toHaveLength(0);
    for (const issueId of [id, id2]) {
      expect(await stored.deliveries(issueId)).toEqual([]);
    }
  });
});

describe("deliverIssue", () => {
  it("records a failure with GitHub's message, and a forced retry succeeds", async () => {
    let fail = true;
    const gh = fakeGithub({
      createIssue: () =>
        fail
          ? { status: 410, body: { message: "Issues are disabled for this repo" } }
          : { status: 201, body: { number: 7, html_url: "https://github.com/acme/web/issues/7" } },
    });
    const { project, conn } = await setup();
    await makeDestination(project.id, conn.id);
    const issue = await makeIssue(project.id);

    const [failed] = await deliverIssue(getStore(), issue.id);
    expect(failed).toMatchObject({
      status: "failed",
      error: "Issues are disabled for this repo",
      attempts: 1,
    });

    fail = false;
    const [sent] = await deliverIssue(getStore(), issue.id, { force: true });
    expect(sent).toMatchObject({
      status: "sent",
      externalId: "7",
      error: null,
      attempts: 2,
    });
    expect(gh.issueCalls()).toHaveLength(2);
  });

  it("is idempotent without force", async () => {
    const gh = fakeGithub();
    const { project, conn } = await setup();
    await makeDestination(project.id, conn.id);
    const issue = await makeIssue(project.id);

    await deliverIssue(getStore(), issue.id);
    expect(await deliverIssue(getStore(), issue.id)).toEqual([]);
    expect(gh.issueCalls()).toHaveLength(1);
  });
});

describe("issue delivery API", () => {
  it("lists deliveries on the issue and sends manually to a paused destination", async () => {
    fakeGithub();
    const { me, project, conn } = await setup();
    await makeDestination(project.id, conn.id, { enabled: false });
    const issue = await makeIssue(project.id);
    const cookie = await authCookie(me.id);

    const before = await app.request(`/api/issues/${issue.id}`, { headers: { cookie } });
    expect(((await before.json()) as { deliveries: unknown[] }).deliveries).toEqual([]);

    const send = await app.request(`/api/issues/${issue.id}/deliveries`, {
      method: "POST",
      headers: { cookie },
    });
    expect(send.status).toBe(200);
    expect(await send.json()).toMatchObject([
      { status: "sent", provider: "github", url: "https://github.com/acme/web/issues/1" },
    ]);

    const after = await app.request(`/api/issues/${issue.id}`, { headers: { cookie } });
    expect(((await after.json()) as { deliveries: unknown[] }).deliveries).toMatchObject([
      { status: "sent", externalId: "1", attempts: 1 },
    ]);
  });

  it("409s with no destination and 404s another user's issue", async () => {
    fakeGithub();
    const { me, project } = await setup();
    const issue = await makeIssue(project.id);
    const other = await makeUser();

    const none = await app.request(`/api/issues/${issue.id}/deliveries`, {
      method: "POST",
      headers: { cookie: await authCookie(me.id) },
    });
    expect(none.status).toBe(409);

    const foreign = await app.request(`/api/issues/${issue.id}/deliveries`, {
      method: "POST",
      headers: { cookie: await authCookie(other.id) },
    });
    expect(foreign.status).toBe(404);
  });
});

describe("project destinations API", () => {
  it("creates, updates, lists and deletes the GitHub destination", async () => {
    const { me, project, conn } = await setup();
    const headers = { cookie: await authCookie(me.id), "content-type": "application/json" };
    const url = `/api/projects/${project.id}/destinations/github`;

    const created = await app.request(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ connectionId: conn.id, config: { owner: "acme", repo: "web" } }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      provider: "github",
      connectionId: conn.id,
      config: { owner: "acme", repo: "web", labels: [] },
      enabled: true,
    });

    const updated = await app.request(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        connectionId: conn.id,
        config: { owner: "acme", repo: "api", labels: ["bug"] },
        enabled: false,
      }),
    });
    expect(await updated.json()).toMatchObject({ config: { repo: "api", labels: ["bug"] }, enabled: false });

    const list = await app.request(`/api/projects/${project.id}/destinations`, { headers });
    expect(await list.json()).toHaveLength(1);

    expect((await app.request(url, { method: "DELETE", headers })).status).toBe(200);
    const empty = await app.request(`/api/projects/${project.id}/destinations`, { headers });
    expect(await empty.json()).toEqual([]);
  });

  it("rejects bad input and other users' projects or connections", async () => {
    const { me, project } = await setup();
    const other = await makeUser();
    const theirConn = await makeConnection(other.id, "9999");
    const theirProject = await makeProject(other.id);
    const myConn = await makeConnection(me.id, "1111");
    const headers = { cookie: await authCookie(me.id), "content-type": "application/json" };
    const put = (projectId: string, body: unknown, provider = "github") =>
      app.request(`/api/projects/${projectId}/destinations/${provider}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });

    const valid = { connectionId: myConn.id, config: { owner: "acme", repo: "web" } };
    expect((await put(project.id, { ...valid, config: { owner: "a/b", repo: "web" } })).status).toBe(400);
    expect((await put(project.id, valid, "jira")).status).toBe(404);
    expect((await put(theirProject.id, valid)).status).toBe(404);
    expect((await put(project.id, { ...valid, connectionId: theirConn.id })).status).toBe(404);
  });
});

describe("GET /f/:token", () => {
  it("serves a stored file with no cookie, and 404s a tampered token", async () => {
    const { project } = await setup();
    const key = `${project.id}/issue/crop.png`;
    await getStorage().put(key, PNG, "image/png");
    const url = new URL(publicFileUrl(key));

    const res = await app.request(url.pathname);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const [body, mac] = url.pathname.slice("/f/".length).split(".");
    const forged = `${Buffer.from(`${project.id}/other/x.png`).toString("base64url")}.${mac}`;
    expect((await app.request(`/f/${forged}`)).status).toBe(404);
    expect((await app.request(`/f/${body}`)).status).toBe(404);
  });
});
