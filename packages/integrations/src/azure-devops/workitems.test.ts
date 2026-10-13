import { describe, expect, it } from "vitest";

import { fakeFetch } from "../test/fake-fetch.ts";
import type { Ticket } from "../ticket.ts";
import { azureDevopsWorkItems, validateWorkItem, type AzureDevopsWorkItemsOptions } from "./workitems.ts";

const ticket: Ticket = {
  id: "iss_1",
  createdAt: "2026-10-11T09:30:00.000Z",
  text: "Save does nothing",
  metadata: {
    url: "https://app.example.com/",
    title: "Example",
    viewport: { width: 800, height: 600 },
    devicePixelRatio: 1,
    userAgent: "UA",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
  links: { dashboard: "https://app.brainbox.sh/i/1", crop: "https://api.brainbox.sh/f/crop" },
};

const created = {
  status: 200,
  body: { id: 1234, _links: { html: { href: "https://dev.azure.com/acme/Web/_workitems/edit/1234" } } },
};

const base: AzureDevopsWorkItemsOptions = {
  organization: "acme",
  project: "Web",
  workItemType: "Bug",
  auth: { pat: "pat-1" },
};

type Op = { op: string; path: string; value: unknown };

function ops(call: { body: unknown }): Op[] {
  return call.body as Op[];
}

function field(call: { body: unknown }, name: string): unknown {
  return ops(call).find((o) => o.path === `/fields/${name}`)?.value;
}

describe("azureDevopsWorkItems", () => {
  it("creates a work item with a JSON Patch body and returns its id and link", async () => {
    const fetch = fakeFetch(created);
    const dest = azureDevopsWorkItems({
      ...base,
      workItemType: "User Story",
      areaPath: "Web\\Checkout",
      iteration: { path: "Web\\Sprint 4" },
      tags: ["brainbox", " feedback ", ""],
      priority: 2,
      assignedTo: "ana@acme.co",
      fields: { "Custom.Product": "Store" },
      fetch,
    });

    const result = await dest.deliver(ticket);

    expect(dest.kind).toBe("azure-devops");
    expect(result).toEqual({
      ok: true,
      externalId: "1234",
      url: "https://dev.azure.com/acme/Web/_workitems/edit/1234",
    });
    const call = fetch.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://dev.azure.com/acme/Web/_apis/wit/workitems/$User%20Story?api-version=7.1");
    expect(call.headers["content-type"]).toBe("application/json-patch+json");
    expect(call.headers.authorization).toBe(`Basic ${btoa(":pat-1")}`);
    expect(field(call, "System.Title")).toBe("Save does nothing");
    expect(field(call, "System.Description")).toContain("<p>Save does nothing</p>");
    expect(field(call, "System.AreaPath")).toBe("Web\\Checkout");
    expect(field(call, "System.IterationPath")).toBe("Web\\Sprint 4");
    expect(field(call, "System.Tags")).toBe("brainbox; feedback");
    expect(field(call, "Microsoft.VSTS.Common.Priority")).toBe(2);
    expect(field(call, "System.AssignedTo")).toBe("ana@acme.co");
    expect(field(call, "Custom.Product")).toBe("Store");
    expect(ops(call)).toContainEqual({
      op: "add",
      path: "/relations/-",
      value: { rel: "Hyperlink", url: "https://app.brainbox.sh/i/1", attributes: { comment: "Brainbox report" } },
    });
  });

  it("writes a Bug's report to Repro Steps and its environment to System Info", async () => {
    const fetch = fakeFetch(created);
    await azureDevopsWorkItems({
      ...base,
      bodyField: "Microsoft.VSTS.TCM.ReproSteps",
      systemInfoField: "Microsoft.VSTS.TCM.SystemInfo",
      fetch,
    }).deliver(ticket);

    const call = fetch.calls[0]!;
    expect(field(call, "System.Description")).toBeUndefined();
    expect(field(call, "Microsoft.VSTS.TCM.ReproSteps")).toContain("Open in Brainbox");
    expect(field(call, "Microsoft.VSTS.TCM.SystemInfo")).toContain(">Browser</th><td>UA</td>");
  });

  it("uploads the images first, embeds the crop and attaches both", async () => {
    const att = (id: string) => ({ status: 201, body: { id, url: `https://dev.azure.com/acme/_apis/wit/attachments/${id}` } });
    const fetch = fakeFetch(att("c"), att("s"), created);
    const bytes = new Uint8Array([1, 2, 3]);
    const file = (name: string) => ({ name, contentType: "image/png", load: async () => bytes });

    await azureDevopsWorkItems({ ...base, fetch }).deliver({
      ...ticket,
      links: { ...ticket.links, screenshot: "https://api.brainbox.sh/f/shot" },
      files: { crop: file("crop.png"), screenshot: file("screenshot.png") },
    });

    const [crop, shot, create] = fetch.calls;
    expect(crop!.url).toBe("https://dev.azure.com/acme/Web/_apis/wit/attachments?fileName=crop.png&api-version=7.1");
    expect(crop!.headers["content-type"]).toBe("application/octet-stream");
    expect(crop!.body).toBe(bytes);
    expect(shot!.url).toContain("fileName=screenshot.png");
    expect(field(create!, "System.Description")).toContain(
      '<img src="https://dev.azure.com/acme/_apis/wit/attachments/c"',
    );
    // Uploaded images stay behind Azure DevOps sign-in: no public link to either.
    expect(field(create!, "System.Description")).not.toContain("api.brainbox.sh/f/");
    expect(field(create!, "System.Description")).toContain(
      '<a href="https://dev.azure.com/acme/_apis/wit/attachments/s">Full screenshot</a>',
    );
    const attached = ops(create!).filter((o) => (o.value as { rel?: string }).rel === "AttachedFile");
    expect(attached.map((o) => (o.value as { url: string }).url)).toEqual([
      "https://dev.azure.com/acme/_apis/wit/attachments/c",
      "https://dev.azure.com/acme/_apis/wit/attachments/s",
    ]);
  });

  it("embeds an uploaded image even when the ticket has no public link", async () => {
    const fetch = fakeFetch({ status: 201, body: { id: "c", url: "https://dev.azure.com/acme/_apis/wit/attachments/c" } }, created);
    await azureDevopsWorkItems({ ...base, fetch }).deliver({
      ...ticket,
      links: { dashboard: ticket.links.dashboard },
      files: { crop: { name: "crop.png", contentType: "image/png", load: async () => new Uint8Array([1]) } },
    });
    expect(field(fetch.calls[1]!, "System.Description")).toContain(
      '<img src="https://dev.azure.com/acme/_apis/wit/attachments/c" alt="Highlighted region"',
    );
  });

  it("falls back to the public link when an upload fails", async () => {
    const fetch = fakeFetch({ status: 500, body: { message: "boom" } }, created);
    const result = await azureDevopsWorkItems({ ...base, fetch }).deliver({
      ...ticket,
      files: { crop: { name: "crop.png", contentType: "image/png", load: async () => new Uint8Array([1]) } },
    });

    expect(result.ok).toBe(true);
    expect(field(fetch.calls[1]!, "System.Description")).toContain('<img src="https://api.brainbox.sh/f/crop"');
    expect(ops(fetch.calls[1]!).some((o) => (o.value as { rel?: string }).rel === "AttachedFile")).toBe(false);
  });

  it("looks the team's current sprint up at send time", async () => {
    const fetch = fakeFetch({ status: 200, body: { value: [{ name: "Sprint 9", path: "Web\\Sprint 9" }] } }, created);
    await azureDevopsWorkItems({ ...base, iteration: { currentFor: "Web Team" }, fetch }).deliver(ticket);

    expect(fetch.calls[0]!.url).toBe(
      "https://dev.azure.com/acme/Web/Web%20Team/_apis/work/teamsettings/iterations?%24timeframe=current&api-version=7.1",
    );
    expect(field(fetch.calls[1]!, "System.IterationPath")).toBe("Web\\Sprint 9");
  });

  it("leaves the iteration unset when the team has no current sprint", async () => {
    const fetch = fakeFetch({ status: 200, body: { value: [] } }, created);
    await azureDevopsWorkItems({ ...base, iteration: { currentFor: "t" }, fetch }).deliver(ticket);
    expect(field(fetch.calls[1]!, "System.IterationPath")).toBeUndefined();
  });

  it("fails rather than filing into the backlog when the team is gone", async () => {
    const fetch = fakeFetch({ status: 404, body: { message: "VS800075: The team Web Team does not exist." } });
    const result = await azureDevopsWorkItems({ ...base, iteration: { currentFor: "Web Team" }, fetch }).deliver(ticket);
    expect(result).toEqual({ ok: false, status: 404, error: "VS800075: The team Web Team does not exist." });
    expect(fetch.calls).toHaveLength(1);
  });

  it("sends an Entra token as Bearer, resolved at send time", async () => {
    const fetch = fakeFetch(created);
    await azureDevopsWorkItems({ ...base, auth: { bearer: async () => "at-1" }, fetch }).deliver(ticket);
    expect(fetch.calls[0]!.headers.authorization).toBe("Bearer at-1");
  });

  it("returns Azure DevOps' own message for a rule error, and never throws", async () => {
    const fetch = fakeFetch({
      status: 400,
      body: { message: "TF401320: Rule Error for field Severity. Error code: Required.", typeKey: "RuleValidationException" },
    });
    expect(await azureDevopsWorkItems({ ...base, fetch }).deliver(ticket)).toEqual({
      ok: false,
      status: 400,
      error: "TF401320: Rule Error for field Severity. Error code: Required.",
    });

    const down = fakeFetch(new Error("network down"));
    expect(await azureDevopsWorkItems({ ...base, fetch: down }).deliver(ticket)).toEqual({
      ok: false,
      error: "network down",
    });
  });

  it("reports a rejected credential as 401, even when it comes back as a sign-in page", async () => {
    const fetch = fakeFetch({ status: 203, body: "<html>sign in</html>" });
    const result = await azureDevopsWorkItems({ ...base, fetch }).deliver(ticket);
    expect(result).toEqual({ ok: false, status: 401, error: "Azure DevOps rejected the credentials" });
  });

  it("reports a missing token without calling out", async () => {
    const fetch = fakeFetch();
    const result = await azureDevopsWorkItems({ ...base, auth: { bearer: async () => "" }, fetch }).deliver(ticket);
    expect(result).toEqual({ ok: false, error: "token: empty token" });
    expect(fetch.calls).toHaveLength(0);
  });

  it("builds the link itself when the response has none", async () => {
    const fetch = fakeFetch({ status: 200, body: { id: 7 } });
    const result = await azureDevopsWorkItems({ ...base, project: "My Web", fetch }).deliver(ticket);
    expect(result).toEqual({ ok: true, externalId: "7", url: "https://dev.azure.com/acme/My%20Web/_workitems/edit/7" });
  });
});

describe("validateWorkItem", () => {
  it("runs the create with validateOnly and nothing to attach", async () => {
    const fetch = fakeFetch({ status: 200, body: { id: -1 } });
    expect(await validateWorkItem({ ...base, fetch })).toEqual({ ok: true });
    const call = fetch.calls[0]!;
    expect(call.url).toContain("validateOnly=true");
    expect(ops(call).some((o) => o.path === "/relations/-")).toBe(false);
  });

  it("returns the rule that failed", async () => {
    const fetch = fakeFetch({ status: 400, body: { message: "TF401347: Invalid tree name given for work item -1, field 'System.AreaPath'." } });
    expect(await validateWorkItem({ ...base, areaPath: "Gone", fetch })).toEqual({
      ok: false,
      status: 400,
      error: "TF401347: Invalid tree name given for work item -1, field 'System.AreaPath'.",
    });
  });
});
