import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { getStore } from "../src/store/index.ts";
import { stored } from "./harness.ts";
import { authCookie, makeIssue, makeProject, makeUser } from "./helpers.ts";

describe("GET /api/issues/:id", () => {
  it("requires auth (401 without a cookie)", async () => {
    expect((await app.request("/api/issues/whatever")).status).toBe(401);
  });

  it("returns the owner's issue with a presigned screenshot url", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    const issue = await makeIssue(project.id);

    const res = await app.request(`/api/issues/${issue.id}`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; screenshot: { url: string } };
    expect(body.id).toBe(issue.id);
    expect(body.screenshot.url).toContain("/api/files/");
  });

  it("404s an issue under another user's project", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const project = await makeProject(other.id);
    const issue = await makeIssue(project.id);

    const res = await app.request(`/api/issues/${issue.id}`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(404);
  });
});

async function patch(path: string, cookie: string, body: unknown) {
  return app.request(path, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("issue triage", () => {
  it("starts every new issue in the inbox with no priority", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    expect(issue.status).toBe("new");
    expect(issue.priority).toBe("none");
    expect(issue.statusChangedAt).toBeNull();
  });

  it("PATCH sets status and priority and logs who changed what", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    const res = await patch(`/api/issues/${issue.id}`, cookie, { status: "in_progress", priority: "high" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; priority: string; statusChangedAt?: string };
    expect(body.status).toBe("in_progress");
    expect(body.priority).toBe("high");
    expect(body.statusChangedAt).toBeDefined();

    const [row] = await stored.issues(issue.id);
    expect(row!.status).toBe("in_progress");

    const activity = await app.request(`/api/issues/${issue.id}/activity`, { headers: { cookie } });
    expect(activity.status).toBe(200);
    const events = (await activity.json()) as Array<{
      kind: string;
      from: string;
      to: string;
      actor?: { id: string; name?: string };
    }>;
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "status", from: "new", to: "in_progress" }),
        expect.objectContaining({ kind: "priority", from: "none", to: "high" }),
      ]),
    );
    expect(events[0]!.actor).toEqual({ id: me.id, name: "Test" });
  });

  it("logs nothing when a patch changes nothing", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "new" })).status).toBe(200);
    expect(await getStore().triage.listEvents(issue.id)).toEqual([]);
  });

  it("keeps a close reason only while the issue is closed", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    await patch(`/api/issues/${issue.id}`, cookie, { status: "closed", closeReason: "duplicate" });
    expect((await stored.issues(issue.id))[0]!.closeReason).toBe("duplicate");

    await patch(`/api/issues/${issue.id}`, cookie, { status: "open" });
    expect((await stored.issues(issue.id))[0]!.closeReason).toBeNull();
  });

  it("rejects a close reason for an issue that isn't being closed", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    expect((await patch(`/api/issues/${issue.id}`, cookie, { closeReason: "spam" })).status).toBe(400);
    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "resolved", closeReason: "spam" })).status).toBe(
      400,
    );
    expect((await stored.issues(issue.id))[0]!.status).toBe("new");
  });

  it("won't close an issue without a reason, one at a time or in bulk", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "closed" })).status).toBe(400);
    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "closed", closeReason: null })).status).toBe(
      400,
    );
    expect((await patch("/api/issues", cookie, { ids: [issue.id], patch: { status: "closed" } })).status).toBe(400);
    expect((await stored.issues(issue.id))[0]!.status).toBe("new");
  });

  it("logs a changed close reason", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    await patch(`/api/issues/${issue.id}`, cookie, { status: "closed", closeReason: "wont_fix" });
    await patch(`/api/issues/${issue.id}`, cookie, { closeReason: "duplicate" });

    const events = await getStore().triage.listEvents(issue.id);
    expect(events.filter((e) => e.kind === "close_reason").map((e) => [e.from, e.to])).toEqual([
      [null, "wont_fix"],
      ["wont_fix", "duplicate"],
    ]);
  });

  it("writes a bulk triage all or nothing when the store rejects one issue", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    // ids fixed so the closed one is written first in either store's order
    const first = await makeIssue(project.id, { id: "00000000-0000-4000-8000-000000000001" });
    const second = await makeIssue(project.id, { id: "00000000-0000-4000-8000-000000000002" });
    await getStore().triage.apply([first.id], { status: "closed", closeReason: "wont_fix" }, me.id);

    // fine for the closed one, rejected for the open one
    await expect(getStore().triage.apply([first.id, second.id], { closeReason: "spam" }, me.id)).rejects.toThrow(
      /needs status closed/,
    );
    expect((await stored.issues(first.id))[0]!.closeReason).toBe("wont_fix");
    expect(await getStore().triage.listEvents(first.id)).toHaveLength(2);
  });

  it("rejects an unknown status and an empty patch", async () => {
    const me = await makeUser();
    const issue = await makeIssue((await makeProject(me.id)).id);
    const cookie = await authCookie(me.id);

    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "done" })).status).toBe(400);
    expect((await patch(`/api/issues/${issue.id}`, cookie, {})).status).toBe(400);
  });

  it("404s triage and activity on another user's issue, and changes nothing", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const issue = await makeIssue((await makeProject(other.id)).id);
    const cookie = await authCookie(me.id);

    expect((await patch(`/api/issues/${issue.id}`, cookie, { status: "resolved" })).status).toBe(404);
    expect((await app.request(`/api/issues/${issue.id}/activity`, { headers: { cookie } })).status).toBe(404);
    expect((await stored.issues(issue.id))[0]!.status).toBe("new");
  });

  it("bulk-updates several issues at once", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    const a = await makeIssue(project.id);
    const b = await makeIssue(project.id);

    const res = await patch("/api/issues", await authCookie(me.id), {
      ids: [a.id, b.id],
      patch: { status: "resolved" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(2);
    expect((await stored.issues(a.id))[0]!.status).toBe("resolved");
    expect((await stored.issues(b.id))[0]!.status).toBe("resolved");
  });

  it("changes none of a bulk edit when one issue isn't the caller's", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const mine = await makeIssue((await makeProject(me.id)).id);
    const theirs = await makeIssue((await makeProject(other.id)).id);

    const res = await patch("/api/issues", await authCookie(me.id), {
      ids: [mine.id, theirs.id],
      patch: { status: "resolved" },
    });
    expect(res.status).toBe(404);
    expect((await stored.issues(mine.id))[0]!.status).toBe("new");
    expect((await stored.issues(theirs.id))[0]!.status).toBe("new");
  });

  it("removes an issue's activity with its project", async () => {
    const me = await makeUser();
    const project = await makeProject(me.id);
    const issue = await makeIssue(project.id);
    await getStore().triage.apply([issue.id], { status: "open" }, me.id);
    expect(await getStore().triage.listEvents(issue.id)).toHaveLength(1);

    await getStore().projects.delete(project.id);
    expect(await getStore().triage.listEvents(issue.id)).toEqual([]);
  });
});
