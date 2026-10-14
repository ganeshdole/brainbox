import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { deliverIssue } from "../src/integrations/dispatch.ts";
import { getStore } from "../src/store/index.ts";
import { fakeAzureDevops, fieldOf } from "./azure-devops-fake.ts";
import { stored } from "./harness.ts";
import {
  ADO_CONFIG,
  authCookie,
  makeAzureDevopsConnection,
  makeAzureDevopsDestination,
  makeConnection,
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

const JSON_HEADERS = { "content-type": "application/json" };

async function setup() {
  const me = await makeUser();
  const project = await makeProject(me.id);
  const cookie = await authCookie(me.id);
  return { me, project, cookie, headers: { cookie, ...JSON_HEADERS } };
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

/** The destination as the dashboard sends it: no organization, no body fields. */
const INPUT = {
  project: ADO_CONFIG.project,
  team: ADO_CONFIG.team,
  areaPath: ADO_CONFIG.areaPath,
  bug: { type: "Bug", iteration: { kind: "current" }, tags: ["brainbox"], priority: 2 },
  feature: { type: "User Story", iteration: { kind: "backlog", path: "Web" }, tags: ["brainbox", "feature-request"], priority: 3 },
};

describe("connecting Azure DevOps with a token", () => {
  it("tries the token, then keeps it sealed and out of every response", async () => {
    const ado = fakeAzureDevops();
    const { project, headers } = await setup();
    const connect = (organization: string, token: string) =>
      app.request("/api/integrations/azure-devops/pat", {
        method: "POST",
        headers,
        body: JSON.stringify({ teamId: project.teamId, organization, token }),
      });

    const bad = await connect("https://dev.azure.com/acme", "wrong");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/rejected the token/);
    expect(await stored.connections(project.teamId)).toEqual([]);

    const res = await connect("https://dev.azure.com/acme/Web/_boards", "fake-pat");
    expect(res.status).toBe(201);
    const conn = await res.json();
    expect(conn).toMatchObject({ provider: "azure-devops", externalId: "pat:acme", label: "acme", auth: "pat", status: "active" });
    expect(conn).not.toHaveProperty("credentials");
    expect(ado.calls.at(-1)?.path).toBe("/acme/_apis/projects?%24top=500&api-version=7.1");

    const [row] = await stored.connections(project.teamId);
    expect(row?.credentials).toMatch(/^v1\./);
    expect(row?.credentials).not.toContain("fake-pat");

    const listed = await app.request(`/api/integrations?teamId=${project.teamId}`, { headers });
    const state = (await listed.json()) as { azureDevops: unknown; connections: unknown[] };
    expect(state.azureDevops).toEqual({ available: true });
    expect(JSON.stringify(state.connections)).not.toContain("v1.");
  });

  it("reconnects the same organization in place, active again", async () => {
    fakeAzureDevops();
    const { me, project, headers } = await setup();
    const old = await makeAzureDevopsConnection(me.id, "old-token");
    await getStore().integrations.setConnectionStatus(old.id, "needs_reauth");

    const res = await app.request("/api/integrations/azure-devops/pat", {
      method: "POST",
      headers,
      body: JSON.stringify({ teamId: project.teamId, organization: "acme.visualstudio.com", token: "fake-pat" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: old.id, status: "active" });
    expect(await stored.connections(project.teamId)).toHaveLength(1);
  });

  it("refuses what isn't an organization, and another Team", async () => {
    fakeAzureDevops();
    const { project, headers } = await setup();
    const other = await makeProject((await makeUser()).id);
    const connect = (teamId: string, organization: string) =>
      app.request("/api/integrations/azure-devops/pat", {
        method: "POST",
        headers,
        body: JSON.stringify({ teamId, organization, token: "fake-pat" }),
      });
    expect((await connect(project.teamId, "https://example.com/acme")).status).toBe(400);
    expect((await connect(project.teamId, "nobody")).status).toBe(400);
    expect((await connect(other.teamId, "acme")).status).toBe(404);
  });
});

describe("Azure DevOps setup lookups", () => {
  it("lists projects, teams, the team's board and the types, as the connection", async () => {
    fakeAzureDevops();
    const { me, headers } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    const get = async (path: string) => {
      const res = await app.request(`/api/integrations/connections/${conn.id}/${path}`, { headers });
      expect(res.status).toBe(200);
      return res.json();
    };

    expect(await get("projects")).toEqual([{ id: "p-1", name: "Web" }]);
    expect(await get("teams?project=p-1")).toEqual([{ id: "t-1", name: "Web Team" }]);
    expect(await get("team?project=p-1&projectName=Web&team=t-1")).toMatchObject({
      defaultAreaPath: "Web\\Checkout",
      bugsBehavior: "asTasks",
      backlogIteration: "Web",
      iterations: [{ name: "Sprint 12", path: "Web\\Sprint 12", timeFrame: "current" }],
    });
    expect(await get("work-item-types?project=p-1")).toEqual([{ name: "Bug" }, { name: "Issue" }, { name: "User Story" }]);
    expect(await get("work-item-type?project=p-1&type=Bug")).toMatchObject({
      bodyField: "Microsoft.VSTS.TCM.ReproSteps",
      hasPriority: true,
      required: [],
    });
  });

  it("marks the connection when Azure DevOps rejects its token, and answers 409 rather than 401", async () => {
    fakeAzureDevops({ rejectAll: true });
    const { me, headers } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);

    const res = await app.request(`/api/integrations/connections/${conn.id}/projects`, { headers });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "needs_reauth" });
    expect((await getStore().integrations.getConnection(conn.id))?.status).toBe("needs_reauth");
  });

  it("is only for Azure DevOps connections", async () => {
    fakeAzureDevops();
    const { me, headers } = await setup();
    const github = await makeConnection(me.id);
    const res = await app.request(`/api/integrations/connections/${github.id}/projects`, { headers });
    expect(res.status).toBe(404);
  });
});

describe("saving an Azure DevOps destination", () => {
  it("fills in where each type's report goes, proves both kinds, then saves", async () => {
    const ado = fakeAzureDevops();
    const { me, project, headers } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);

    const res = await app.request(`/api/projects/${project.id}/destinations/azure-devops`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ connectionId: conn.id, config: { ...INPUT, feature: { ...INPUT.feature, type: "Issue" } } }),
    });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { config: typeof ADO_CONFIG };
    expect(saved.config).toMatchObject({
      organization: "acme",
      bug: { bodyField: "Microsoft.VSTS.TCM.ReproSteps", systemInfoField: "Microsoft.VSTS.TCM.SystemInfo", priority: 2 },
      feature: { type: "Issue", bodyField: "System.Description", fields: [] },
    });
    // Issue has no Priority field here, so none is kept for it.
    expect(saved.config.feature).not.toHaveProperty("priority");
    const dryRuns = ado.calls.filter((c) => c.path.includes("validateOnly=true")).map((c) => c.path.split("$")[1]?.split("?")[0]);
    expect(dryRuns).toEqual(["Bug", "Issue"]);
    expect(ado.created()).toEqual([]);
  });

  it("answers 422 with the rule Azure DevOps names, and saves nothing", async () => {
    fakeAzureDevops({
      rule: (type, fields) =>
        type === "User Story" && fields["Custom.Product"] === undefined
          ? { status: 400, body: { message: "TF401320: Rule Error for field Product. Error code: Required." } }
          : null,
    });
    const { me, project, headers } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    const put = (config: unknown) =>
      app.request(`/api/projects/${project.id}/destinations/azure-devops`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ connectionId: conn.id, config }),
      });

    const res = await put(INPUT);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "User Story: TF401320: Rule Error for field Product. Error code: Required." });
    expect(await stored.destinations()).toEqual([]);

    const fixed = await put({ ...INPUT, feature: { ...INPUT.feature, fields: [{ referenceName: "Custom.Product", value: "Web" }] } });
    expect(fixed.status).toBe(200);
  });

  it("refuses a GitHub connection for Azure DevOps", async () => {
    fakeAzureDevops();
    const { me, project, headers } = await setup();
    const github = await makeConnection(me.id);
    const res = await app.request(`/api/projects/${project.id}/destinations/azure-devops`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ connectionId: github.id, config: INPUT }),
    });
    expect(res.status).toBe(404);
  });
});

describe("delivering to Azure DevOps", () => {
  it("files a report from /ingest as a work item with its screenshot, recording and voice note attached", async () => {
    const ado = fakeAzureDevops();
    const { me, project } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    await makeAzureDevopsDestination(project.id, conn.id);

    const fd = new FormData();
    fd.append(
      "json",
      JSON.stringify({
        projectKey: project.key,
        kind: "bug",
        text: "Invoice total is wrong",
        metadata: {
          url: "https://app.fabrikam.example/invoices/7",
          title: "Invoice 7",
          viewport: { width: 1440, height: 900 },
          devicePixelRatio: 2,
          userAgent: "Mozilla/5.0 Chrome/130",
          language: "en-US",
          timezone: "America/New_York",
          consoleErrors: ["TypeError: total is undefined"],
          identity: { id: "u-9", name: "Ana Lima", email: "ana@fabrikam.example" },
          fields: [
            { label: "Organization", value: "Fabrikam Retail" },
            { label: "Location", value: "Downtown" },
            { label: "Tenant ID", value: "ten-1" },
            { label: "Location ID", value: "loc-3" },
          ],
        },
      }),
    );
    fd.append("screenshot", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "s.png", { type: "image/png" }));
    fd.append("video", new File([new Uint8Array(64)], "r.webm", { type: "video/webm" }));
    fd.append("audio", new File([new Uint8Array(16)], "v.webm", { type: "audio/webm" }));

    const res = await app.request("/ingest", { method: "POST", body: fd });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [delivery] = await settled(id);
    expect(delivery).toMatchObject({
      status: "sent",
      provider: "azure-devops",
      externalId: "100",
      externalUrl: "https://dev.azure.com/acme/Web/_workitems/edit/100",
    });

    expect(ado.uploads().map((c) => [new URLSearchParams(c.path.split("?")[1]).get("fileName"), c.body])).toEqual([
      ["screenshot.png", 4],
      ["recording.webm", 64],
      ["audio.webm", 16],
    ]);
    const [item] = ado.created();
    expect(item?.type).toBe("Bug");
    const ops = item?.ops ?? [];
    const body = String(fieldOf(ops, "Microsoft.VSTS.TCM.ReproSteps"));
    expect(body).toMatch(/<img src="https:\/\/dev\.azure\.com\/acme\/p-1\/_apis\/wit\/attachments\/att-\d+"/);
    expect(body).toContain(">Watch the recording</a>");
    expect(body).toContain(">Listen to the voice note</a>");
    expect(body).not.toContain("/f/");
    for (const text of ["Ana Lima &lt;ana@fabrikam.example&gt;", "Fabrikam Retail", "Downtown", "ten-1", "loc-3", "TypeError: total is undefined"]) {
      expect(body).toContain(text);
    }
    expect(fieldOf(ops, "System.IterationPath")).toBe("Web\\Sprint 12");
    expect(fieldOf(ops, "System.AreaPath")).toBe("Web\\Checkout");
    expect(fieldOf(ops, "System.Tags")).toBe("brainbox");
    expect(String(fieldOf(ops, "Microsoft.VSTS.TCM.SystemInfo"))).toContain("Chrome/130");
    const relations = ops.filter((o) => o.path === "/relations/-").map((o) => (o.value as { rel: string }).rel);
    expect(relations).toEqual(["AttachedFile", "AttachedFile", "AttachedFile", "Hyperlink"]);
  });

  it("files a feature request as the feature type, with its importance as Priority", async () => {
    const ado = fakeAzureDevops();
    const { me, project } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    await makeAzureDevopsDestination(project.id, conn.id);
    const issue = await makeIssue(project.id, { kind: "feature", importance: "critical", text: "Bulk invoice export", screenshotKey: null });

    const [delivery] = await deliverIssue(getStore(), issue.id);
    expect(delivery?.status).toBe("sent");
    const [item] = ado.created();
    expect(item?.type).toBe("User Story");
    expect(fieldOf(item?.ops ?? [], "Microsoft.VSTS.Common.Priority")).toBe(1);
    expect(fieldOf(item?.ops ?? [], "System.Tags")).toBe("brainbox; feature-request");
    expect(fieldOf(item?.ops ?? [], "System.IterationPath")).toBe("Web");
    expect(String(fieldOf(item?.ops ?? [], "System.Description"))).toContain("Blocking them");
  });

  it("marks a connection whose token is rejected, and stops calling until it is reconnected", async () => {
    const ado = fakeAzureDevops({ rejectAll: true });
    const { me, project } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    await makeAzureDevopsDestination(project.id, conn.id);
    const first = await makeIssue(project.id, { screenshotKey: null });

    const [failed] = await deliverIssue(getStore(), first.id);
    expect(failed).toMatchObject({ status: "failed", error: "Azure DevOps rejected the token. Connect Azure DevOps again in Settings." });
    expect((await getStore().integrations.getConnection(conn.id))?.status).toBe("needs_reauth");

    const callsBefore = ado.calls.length;
    const second = await makeIssue(project.id, { screenshotKey: null });
    const [skipped] = await deliverIssue(getStore(), second.id);
    expect(skipped?.status).toBe("failed");
    expect(ado.calls).toHaveLength(callsBefore);
  });
});

describe("sending a test report", () => {
  it("creates a work item through the saved destination and links it, recording nothing", async () => {
    const ado = fakeAzureDevops();
    const { me, project, headers } = await setup();
    const conn = await makeAzureDevopsConnection(me.id);
    await makeAzureDevopsDestination(project.id, conn.id, { enabled: false });

    const res = await app.request(`/api/projects/${project.id}/destinations/azure-devops/test`, { method: "POST", headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ externalId: "100", url: "https://dev.azure.com/acme/Web/_workitems/edit/100" });
    expect(String(fieldOf(ado.created()[0]?.ops ?? [], "System.Title"))).toBe("Test report from Brainbox");

    const none = await app.request(`/api/projects/${project.id}/destinations/github/test`, { method: "POST", headers });
    expect(none.status).toBe(404);
  });
});
