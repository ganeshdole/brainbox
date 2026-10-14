import { Webhook } from "standardwebhooks";
import type { ReportStatusEvent } from "@ganeshdole/brainbox-shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { deliverIssue } from "../src/integrations/dispatch.ts";
import { getStore } from "../src/store/index.ts";
import { fakeAzureDevops } from "./azure-devops-fake.ts";
import { testEnv } from "./env.ts";
import {
  authCookie,
  makeAzureDevopsConnection,
  makeAzureDevopsDestination,
  makeIssue,
  makeProject,
  makeUser,
} from "./helpers.ts";

vi.mock("../src/lib/transcription.ts", () => ({
  transcribeAudio: vi.fn(),
  transcriptionEnabled: () => false,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Received {
  headers: Record<string, string>;
  body: string;
}

/** Azure DevOps, plus a host app at STATUS_WEBHOOK_URL that answers `status`. */
function fakes(opts: { status?: () => number } = {}) {
  const ado = fakeAzureDevops();
  const received: Received[] = [];
  const adoFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(testEnv.STATUS_WEBHOOK_URL!)) return adoFetch(input, init);
    received.push({ headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body) });
    return new Response("ok", { status: opts.status?.() ?? 200 });
  });
  return { ado, received, events: () => received.map((r) => JSON.parse(r.body) as ReportStatusEvent) };
}

/** A report delivered to the fake as work item 100 in org "acme". */
async function delivered(over: Parameters<typeof makeIssue>[1] = {}) {
  const me = await makeUser();
  const project = await makeProject(me.id);
  const conn = await makeAzureDevopsConnection(me.id);
  await makeAzureDevopsDestination(project.id, conn.id);
  const issue = await makeIssue(project.id, {
    screenshotKey: null,
    text: "Invoice total is wrong",
    metadata: {
      url: "https://app.hapivet.ai/invoices/7",
      title: "Invoice 7",
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      userAgent: "UA",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
      identity: { id: "hv-user-9", name: "Dr. Ana Lima", email: "ana@clinic.example" },
      fields: [
        { label: "Organization", value: "Happy Paws" },
        { label: "Location", value: "Downtown" },
        { label: "Tenant ID", value: "ten-1" },
        { label: "Location ID", value: "loc-3" },
      ],
    },
    ...over,
  });
  const [delivery] = await deliverIssue(getStore(), issue.id);
  expect(delivery).toMatchObject({ status: "sent", externalId: "100" });
  return { me, project, issue };
}

/** A `workitem.updated` service hook body for work item `id`. */
function hook(o: { id?: number; org?: string; rev: number; from?: string; to: string; comment?: string; type?: string }) {
  const fields: Record<string, unknown> = { "System.Rev": { oldValue: o.rev - 1, newValue: o.rev } };
  if (o.from) fields["System.State"] = { oldValue: o.from, newValue: o.to };
  if (o.comment) fields["System.History"] = { newValue: o.comment };
  const id = o.id ?? 100;
  return {
    eventType: "workitem.updated",
    resource: {
      workItemId: id,
      rev: o.rev,
      revisedBy: { displayName: "Jamal Hartnett", uniqueName: "jamal@hapivet.ai" },
      revisedDate: "2026-10-14T09:00:00.000Z",
      fields,
      revision: { id, rev: o.rev, fields: { "System.WorkItemType": o.type ?? "Bug", "System.State": o.to } },
      url: `https://dev.azure.com/${o.org ?? "acme"}/p-1/_apis/wit/workItems/${id}/updates/${o.rev}`,
    },
  };
}

function send(body: unknown, password = testEnv.AZURE_DEVOPS_HOOK_SECRET!) {
  return app.request("/webhooks/azure-devops", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${btoa(`azure-devops:${password}`)}` },
    body: JSON.stringify(body),
  });
}

/** Waits for the background notification of the issue's newest update to settle. */
async function notified(issueId: string) {
  for (let i = 0; i < 100; i++) {
    const [latest] = await getStore().integrations.listWorkItemUpdates(issueId);
    if (latest?.notifyStatus) return latest;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("the status webhook was never called");
}

describe("Azure DevOps service hooks", () => {
  it("refuses a missing or wrong password", async () => {
    fakes();
    const body = hook({ rev: 2, from: "New", to: "Active" });
    expect((await send(body, "wrong")).status).toBe(401);
    const none = await app.request("/webhooks/azure-devops", { method: "POST", body: JSON.stringify(body) });
    expect(none.status).toBe(401);
  });

  it("records the change on the report, moves its triage status and tells the host app", async () => {
    const { received } = fakes();
    const { project, issue } = await delivered();

    const res = await send(hook({ rev: 2, from: "New", to: "Active", comment: "<div>On it &amp; testing</div>" }));
    expect(await res.json()).toEqual({ ok: true, recorded: 1 });
    const update = await notified(issue.id);
    expect(update).toMatchObject({
      state: "Active",
      category: "InProgress",
      previousState: "New",
      previousCategory: "Proposed",
      changedByName: "Jamal Hartnett",
      changedByEmail: "jamal@hapivet.ai",
      comment: "<div>On it &amp; testing</div>",
      notifyStatus: "sent",
      notifyAttempts: 1,
    });
    expect((await getStore().issues.get(issue.id))?.status).toBe("in_progress");

    const [call] = received;
    const verified = new Webhook(testEnv.STATUS_WEBHOOK_SECRET!).verify(call!.body, call!.headers) as ReportStatusEvent;
    expect(call!.headers["webhook-id"]).toBe(update.id);
    expect(verified).toEqual({
      id: update.id,
      type: "report.work_item.updated",
      version: 1,
      createdAt: expect.any(String),
      project: { id: project.id, key: project.key, name: project.name },
      report: {
        id: issue.id,
        kind: "bug",
        title: "Invoice total is wrong",
        url: `http://localhost:5173/projects/${project.id}/issues/${issue.id}`,
        status: "in_progress",
        createdAt: issue.createdAt.toISOString(),
      },
      reporter: { id: "hv-user-9", name: "Dr. Ana Lima", email: "ana@clinic.example" },
      fields: [
        { label: "Organization", value: "Happy Paws" },
        { label: "Location", value: "Downtown" },
        { label: "Tenant ID", value: "ten-1" },
        { label: "Location ID", value: "loc-3" },
      ],
      workItem: {
        provider: "azure-devops",
        id: 100,
        url: "https://dev.azure.com/acme/Web/_workitems/edit/100",
        type: "Bug",
        revision: 2,
      },
      change: {
        previous: { state: "New", category: "Proposed" },
        current: { state: "Active", category: "InProgress" },
        stateChanged: true,
        changedBy: { name: "Jamal Hartnett", email: "jamal@hapivet.ai" },
        changedAt: "2026-10-14T09:00:00.000Z",
        comment: { html: "<div>On it &amp; testing</div>", text: "On it & testing" },
      },
    });
  });

  it("applies a revision once, however often Azure DevOps sends it", async () => {
    const { received } = fakes();
    const { issue } = await delivered();
    const body = hook({ rev: 3, from: "New", to: "Resolved" });

    expect(await (await send(body)).json()).toEqual({ ok: true, recorded: 1 });
    await notified(issue.id);
    expect(await (await send(body)).json()).toEqual({ ok: true, recorded: 0 });
    expect(await getStore().integrations.listWorkItemUpdates(issue.id)).toHaveLength(1);
    expect(received).toHaveLength(1);
  });

  it("maps every state category onto triage, using the type's own states", async () => {
    fakes();
    const { issue } = await delivered();
    const steps: Array<[string, string, string | null]> = [
      ["New", "open", null],
      ["Active", "in_progress", null],
      ["Resolved", "resolved", null],
      ["Shipped", "resolved", null], // a custom state the process put in Completed
      ["Removed", "closed", "wont_fix"],
      ["Closed", "resolved", null],
    ];
    let from = "Proposed-ish";
    let rev = 10;
    for (const [to, status, closeReason] of steps) {
      await send(hook({ rev: rev++, from, to }));
      expect(await getStore().issues.get(issue.id)).toMatchObject({ status, closeReason });
      from = to;
    }
  });

  it("tells the host app about a comment without changing triage", async () => {
    const { events } = fakes();
    const { issue } = await delivered();
    await send(hook({ rev: 4, to: "New", comment: "Which clinic was this?" }));
    await notified(issue.id);
    expect((await getStore().issues.get(issue.id))?.status).toBe("new");
    expect(events()[0]?.change).toMatchObject({
      previous: { state: "New" },
      current: { state: "New" },
      stateChanged: false,
      comment: { text: "Which clinic was this?" },
    });
  });

  it("ignores work items Brainbox didn't make, other organizations, and changes that say nothing", async () => {
    const { received } = fakes();
    const { issue } = await delivered();
    for (const body of [
      hook({ id: 999, rev: 2, from: "New", to: "Active" }),
      hook({ org: "someone-else", rev: 2, from: "New", to: "Active" }),
      hook({ rev: 2, to: "New" }),
      { eventType: "workitem.commented", resource: {} },
    ]) {
      const res = await send(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, recorded: 0 });
    }
    expect(await getStore().integrations.listWorkItemUpdates(issue.id)).toEqual([]);
    expect(received).toEqual([]);
  });

  it("records a failed notification on the report, and a retry sends the same event", async () => {
    let status = 500;
    const { received } = fakes({ status: () => status });
    const { me, issue } = await delivered();
    await send(hook({ rev: 2, from: "New", to: "Active" }));
    const failed = await notified(issue.id);
    expect(failed).toMatchObject({ notifyStatus: "failed", notifyError: "HTTP 500: ok", notifyAttempts: 1 });

    const cookie = await authCookie(me.id);
    const shown = await app.request(`/api/issues/${issue.id}`, { headers: { cookie } });
    expect(((await shown.json()) as { deliveries: unknown[] }).deliveries).toMatchObject([
      {
        provider: "azure-devops",
        workItem: { state: "Active", category: "InProgress", notification: { status: "failed", attempts: 1 } },
      },
    ]);

    status = 200;
    const retry = await app.request(`/api/issues/${issue.id}/work-item-updates/${failed.id}/notify`, {
      method: "POST",
      headers: { cookie },
    });
    expect(await retry.json()).toMatchObject({ notification: { status: "sent", attempts: 2 } });
    expect(received.map((r) => r.headers["webhook-id"])).toEqual([failed.id, failed.id]);
  });
});
