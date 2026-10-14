import { describe, expect, it } from "vitest";
import type { Feature, FeatureDetail, Issue } from "@ganeshdole/brainbox-shared";

import { app } from "../src/app.ts";
import { getStore } from "../src/store/index.ts";
import { addMember, authCookie, makeIssue, makeProject, makeUser } from "./helpers.ts";

async function setup() {
  const me = await makeUser();
  const project = await makeProject(me.id);
  const cookie = await authCookie(me.id);
  const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
    app.request(path, {
      method: init.method ?? "GET",
      headers: { cookie, "content-type": "application/json" },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    });
  const request = (text: string) =>
    makeIssue(project.id, { kind: "feature", text, screenshotKey: null, region: null });
  return { me, project, call, request };
}

const create = async (
  call: Awaited<ReturnType<typeof setup>>["call"],
  projectId: string,
  body: Record<string, unknown>,
) => {
  const res = await call(`/api/projects/${projectId}/features`, { method: "POST", body });
  expect(res.status).toBe(201);
  return (await res.json()) as Feature;
};

describe("features", () => {
  it("starts a feature from a request, lists it with its demand, and shows its requests", async () => {
    const { project, call, request } = await setup();
    const first = await request("CSV export please");

    const feature = await create(call, project.id, {
      title: "Export invoices to CSV",
      description: "  ",
      requestIds: [first.id],
    });
    expect(feature).toMatchObject({
      title: "Export invoices to CSV",
      status: "under_review",
      requestCount: 1,
    });
    // a blank description is no description
    expect(feature.description).toBeUndefined();

    const listed = (await (await call(`/api/projects/${project.id}/features`)).json()) as Feature[];
    expect(listed).toEqual([feature]);

    const detail = (await (await call(`/api/features/${feature.id}`)).json()) as FeatureDetail;
    expect(detail.requests.map((r) => r.id)).toEqual([first.id]);
    expect(detail.requests[0]?.featureId).toBe(feature.id);
  });

  it("attaches a request to a feature and sends it back to waiting", async () => {
    const { project, call, request } = await setup();
    const feature = await create(call, project.id, { title: "Dark mode" });
    const ask = await request("dark mode?");

    const attached = await call(`/api/issues/${ask.id}/feature`, {
      method: "PUT",
      body: { featureId: feature.id },
    });
    expect(attached.status).toBe(200);
    expect(((await attached.json()) as Issue).featureId).toBe(feature.id);
    const [listed] = (await (await call(`/api/projects/${project.id}/features`)).json()) as Feature[];
    expect(listed?.requestCount).toBe(1);

    const detached = await call(`/api/issues/${ask.id}/feature`, { method: "PUT", body: { featureId: null } });
    expect(((await detached.json()) as Issue).featureId).toBeUndefined();
    expect((await getStore().issues.get(ask.id))?.featureId).toBeNull();
  });

  it("keeps bugs out, and keeps features to their own project", async () => {
    const { me, project, call } = await setup();
    const feature = await create(call, project.id, { title: "SSO" });
    const bug = await makeIssue(project.id);
    const other = await makeProject(me.id);
    const elsewhere = await makeIssue(other.id, { kind: "feature", text: "x" });

    const onBug = await call(`/api/issues/${bug.id}/feature`, { method: "PUT", body: { featureId: feature.id } });
    expect(onBug.status).toBe(400);
    const crossed = await call(`/api/issues/${elsewhere.id}/feature`, {
      method: "PUT",
      body: { featureId: feature.id },
    });
    expect(crossed.status).toBe(404);
    const fromElsewhere = await call(`/api/projects/${project.id}/features`, {
      method: "POST",
      body: { title: "Y", requestIds: [elsewhere.id] },
    });
    expect(fromElsewhere.status).toBe(400);
    const fromBug = await call(`/api/projects/${project.id}/features`, {
      method: "POST",
      body: { title: "Y", requestIds: [bug.id] },
    });
    expect(fromBug.status).toBe(400);
    // nothing half-made was left behind
    expect(await getStore().features.listForProject(project.id)).toHaveLength(1);
  });

  it("updates the title, description and status, and refuses a bad patch", async () => {
    const { project, call } = await setup();
    const feature = await create(call, project.id, { title: "Bulk edit", description: "Edit many at once" });

    const res = await call(`/api/features/${feature.id}`, {
      method: "PATCH",
      body: { title: "Bulk edit invoices", status: "planned", description: null },
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as Feature;
    expect(updated).toMatchObject({ title: "Bulk edit invoices", status: "planned" });
    expect(updated.description).toBeUndefined();
    expect(updated.updatedAt >= feature.updatedAt).toBe(true);

    expect((await call(`/api/features/${feature.id}`, { method: "PATCH", body: {} })).status).toBe(400);
    expect(
      (await call(`/api/features/${feature.id}`, { method: "PATCH", body: { status: "done" } })).status,
    ).toBe(400);
    expect(
      (await call(`/api/features/${feature.id}`, { method: "PATCH", body: { title: "  " } })).status,
    ).toBe(400);
  });

  it("merges a duplicate into another feature, moving its requests", async () => {
    const { project, call, request } = await setup();
    const a = await request("csv");
    const b = await request("excel export");
    const c = await request("export to spreadsheet");
    const keep = await create(call, project.id, { title: "Export", requestIds: [a.id] });
    const dupe = await create(call, project.id, { title: "Excel export", requestIds: [b.id, c.id] });

    const res = await call(`/api/features/${dupe.id}/merge`, { method: "POST", body: { into: keep.id } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Feature).requestCount).toBe(3);
    expect((await call(`/api/features/${dupe.id}`)).status).toBe(404);
    const detail = (await (await call(`/api/features/${keep.id}`)).json()) as FeatureDetail;
    expect(detail.requests.map((r) => r.id).sort()).toEqual([a.id, b.id, c.id].sort());

    const self = await call(`/api/features/${keep.id}/merge`, { method: "POST", body: { into: keep.id } });
    expect(self.status).toBe(400);
  });

  it("sends a deleted feature's requests back to waiting, and goes with its project", async () => {
    const { project, call, request } = await setup();
    const ask = await request("calendar sync");
    const feature = await create(call, project.id, { title: "Calendar sync", requestIds: [ask.id] });

    expect((await call(`/api/features/${feature.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await getStore().issues.get(ask.id))?.featureId).toBeNull();
    expect(await getStore().issues.get(ask.id)).not.toBeNull();

    await create(call, project.id, { title: "Another", requestIds: [ask.id] });
    await getStore().projects.delete(project.id);
    expect(await getStore().features.listForProject(project.id)).toEqual([]);
  });

  it("lets any member of the project's Team work on its features", async () => {
    const { project, call } = await setup();
    const feature = await create(call, project.id, { title: "Shared" });
    const teammate = await makeUser();
    await addMember(project.teamId, teammate.id);
    const cookie = await authCookie(teammate.id);

    const list = await app.request(`/api/projects/${project.id}/features`, { headers: { cookie } });
    expect(((await list.json()) as Feature[]).map((f) => f.id)).toEqual([feature.id]);
    const patched = await app.request(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "planned" }),
    });
    expect(((await patched.json()) as Feature).status).toBe("planned");
  });

  it("404s another account's project and features", async () => {
    const { project, call } = await setup();
    const feature = await create(call, project.id, { title: "Mine" });
    const stranger = await makeUser();
    const cookie = await authCookie(stranger.id);
    const as = (path: string, method = "GET", body?: unknown) =>
      app.request(path, {
        method,
        headers: { cookie, "content-type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });

    expect((await as(`/api/projects/${project.id}/features`)).status).toBe(404);
    expect((await as(`/api/projects/${project.id}/features`, "POST", { title: "x" })).status).toBe(404);
    expect((await as(`/api/features/${feature.id}`)).status).toBe(404);
    expect((await as(`/api/features/${feature.id}`, "PATCH", { status: "shipped" })).status).toBe(404);
    expect((await as(`/api/features/${feature.id}`, "DELETE")).status).toBe(404);
  });
});
