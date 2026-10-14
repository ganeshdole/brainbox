import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { authCookie, makeIssue, makeProject, makeUser } from "./helpers.ts";

describe("/api/projects", () => {
  it("requires auth (401 without a cookie)", async () => {
    expect((await app.request("/api/projects")).status).toBe(401);
  });

  it("lists only the caller's projects", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await makeProject(me.id);
    await makeProject(other.id);

    const res = await app.request("/api/projects", {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it("creates a project with a generated pk_ key owned by the caller", async () => {
    const me = await makeUser();
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ name: "My App", allowedOrigins: ["https://app.example"] }),
    });
    expect(res.status).toBe(201);
    const project = (await res.json()) as { key: string; name: string; allowedOrigins: string[] };
    expect(project.key).toMatch(/^pk_/);
    expect(project.name).toBe("My App");
    expect(project.allowedOrigins).toEqual(["https://app.example"]);
  });

  it("404s another user's project (no existence leak)", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const theirs = await makeProject(other.id);

    const res = await app.request(`/api/projects/${theirs.id}`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(404);
  });

  it("returns a project's issues newest-first", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    await makeIssue(project.id, { text: "older", createdAt: new Date("2024-01-01T00:00:00Z") });
    await makeIssue(project.id, { text: "newer", createdAt: new Date("2024-02-01T00:00:00Z") });

    const res = await app.request(`/api/projects/${project.id}/issues`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { text: string }[];
    expect(rows.map((r) => r.text)).toEqual(["newer", "older"]);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("updates allowed origins for the owner", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    const res = await app.request(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ allowedOrigins: ["https://app.example.com", "http://localhost:3000"] }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { allowedOrigins: string[] };
    expect(updated.allowedOrigins).toEqual(["https://app.example.com", "http://localhost:3000"]);
  });

  it("rejects values that are not origins", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    const res = await app.request(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ allowedOrigins: ["https://app.example.com/path"] }),
    });
    expect(res.status).toBe(400);
  });

  it("404s another user's project", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const p = await makeProject(other.id);
    const res = await app.request(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({ name: "hijack" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an empty patch", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    const res = await app.request(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { cookie: await authCookie(me.id), "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes the owner's project and cascades its issues", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    const issue = await makeIssue(p.id);
    const cookie = await authCookie(me.id);

    const res = await app.request(`/api/projects/${p.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(200);

    expect((await app.request(`/api/projects/${p.id}`, { headers: { cookie } })).status).toBe(404);
    expect((await app.request(`/api/issues/${issue.id}`, { headers: { cookie } })).status).toBe(404);
  });

  it("404s another user's project (no existence leak)", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const theirs = await makeProject(other.id);

    const res = await app.request(`/api/projects/${theirs.id}`, {
      method: "DELETE",
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(404);

    // still there for its owner
    const check = await app.request(`/api/projects/${theirs.id}`, {
      headers: { cookie: await authCookie(other.id) },
    });
    expect(check.status).toBe(200);
  });
});

describe("GET /api/projects issue counts", () => {
  it("includes issueCount per project", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    await makeIssue(p.id);
    await makeIssue(p.id);
    const res = await app.request("/api/projects", {
      headers: { cookie: await authCookie(me.id) },
    });
    const rows = (await res.json()) as { id: string; issueCount: number }[];
    expect(rows.find((r) => r.id === p.id)?.issueCount).toBe(2);
  });

  it("says how many of them are feature requests", async () => {
    const me = await makeUser();
    const p = await makeProject(me.id);
    const empty = await makeProject(me.id);
    await makeIssue(p.id);
    await makeIssue(p.id, { kind: "feature", text: "dark mode" });
    const res = await app.request("/api/projects", {
      headers: { cookie: await authCookie(me.id) },
    });
    const rows = (await res.json()) as { id: string; issueCount: number; featureRequestCount: number }[];
    expect(rows.find((r) => r.id === p.id)).toMatchObject({ issueCount: 2, featureRequestCount: 1 });
    expect(rows.find((r) => r.id === empty.id)).toMatchObject({ issueCount: 0, featureRequestCount: 0 });
  });
});
