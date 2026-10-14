import { describe, expect, it } from "vitest";

import { fakeFetch } from "../test/fake-fetch.ts";
import { azureDevops } from "./catalog.ts";
import { AzureDevopsApiError } from "./client.ts";

const project = { id: "p-1", name: "Web" };

describe("azureDevops catalog", () => {
  it("lists the signed-in user's organizations through their profile", async () => {
    const fetch = fakeFetch(
      { status: 200, body: { id: "member-1" } },
      { status: 200, body: { value: [{ accountName: "zeta" }, { accountName: "Acme" }, {}] } },
    );
    const orgs = await azureDevops({ auth: { bearer: "at" }, fetch }).organizations();

    expect(orgs).toEqual(["Acme", "zeta"]);
    expect(fetch.calls[0]!.url).toBe("https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1");
    expect(fetch.calls[1]!.url).toBe(
      "https://app.vssps.visualstudio.com/_apis/accounts?memberId=member-1&api-version=7.1",
    );
    expect(fetch.calls[0]!.headers.authorization).toBe("Bearer at");
  });

  it("lists projects and teams by name", async () => {
    const fetch = fakeFetch(
      { status: 200, body: { value: [{ id: "2", name: "web" }, { id: "1", name: "Api" }] } },
      { status: 200, body: { value: [{ id: "t", name: "Web Team" }] } },
    );
    const ado = azureDevops({ auth: { pat: "p" }, fetch });

    expect(await ado.projects("acme")).toEqual([
      { id: "1", name: "Api" },
      { id: "2", name: "web" },
    ]);
    expect(await ado.teams("acme", "p-1")).toEqual([{ id: "t", name: "Web Team" }]);
    expect(fetch.calls[0]!.url).toBe("https://dev.azure.com/acme/_apis/projects?%24top=500&api-version=7.1");
    expect(fetch.calls[1]!.url).toBe(
      "https://dev.azure.com/acme/_apis/projects/p-1/teams?%24top=500&%24skip=0&api-version=7.1",
    );
  });

  it("follows the continuation token through every page of projects", async () => {
    const fetch = fakeFetch(
      { status: 200, body: { value: [{ id: "1", name: "A" }] }, headers: { "x-ms-continuationtoken": "next-1" } },
      { status: 200, body: { value: [{ id: "2", name: "B" }] } },
    );
    expect(await azureDevops({ auth: { pat: "p" }, fetch }).projects("acme")).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ]);
    expect(fetch.calls[1]!.url).toBe(
      "https://dev.azure.com/acme/_apis/projects?%24top=500&continuationToken=next-1&api-version=7.1",
    );
  });

  it("pages through teams until a short page", async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, name: `Team ${String(i).padStart(3, "0")}` }));
    const fetch = fakeFetch({ status: 200, body: { value: full } }, { status: 200, body: { value: [{ id: "last", name: "Zed" }] } });
    const teams = await azureDevops({ auth: { pat: "p" }, fetch }).teams("acme", "p-1");
    expect(teams).toHaveLength(501);
    expect(teams.at(-1)).toEqual({ id: "last", name: "Zed" });
    expect(fetch.calls[1]!.url).toContain("%24skip=500");
    expect(fetch.calls).toHaveLength(2);
  });

  it("reads a team's areas, bug setting, backlog and sprints", async () => {
    const fetch = fakeFetch(
      {
        status: 200,
        body: {
          defaultValue: "Web\\Checkout",
          values: [{ value: "Web\\Checkout", includeChildren: true }, { value: "Web\\Cart" }],
        },
      },
      { status: 200, body: { bugsBehavior: "asRequirements", backlogIteration: { name: "Web", path: "" } } },
      {
        status: 200,
        body: {
          value: [
            { name: "Sprint 1", path: "Web\\Sprint 1", attributes: { timeFrame: "past" } },
            { name: "Sprint 2", path: "Web\\Sprint 2", attributes: { timeFrame: "current" } },
          ],
        },
      },
    );
    const settings = await azureDevops({ auth: { pat: "p" }, fetch }).teamSettings("acme", project, "Web Team");

    expect(settings).toEqual({
      defaultAreaPath: "Web\\Checkout",
      areaPaths: ["Web\\Checkout", "Web\\Cart"],
      bugsBehavior: "asRequirements",
      backlogIteration: "Web",
      iterations: [
        { name: "Sprint 1", path: "Web\\Sprint 1", timeFrame: "past" },
        { name: "Sprint 2", path: "Web\\Sprint 2", timeFrame: "current" },
      ],
    });
    expect(fetch.calls[0]!.url).toBe(
      "https://dev.azure.com/acme/p-1/Web%20Team/_apis/work/teamsettings/teamfieldvalues?api-version=7.1",
    );
  });

  it("says when a team keeps Bugs off its board, and qualifies a relative backlog path", async () => {
    const fetch = fakeFetch(
      { status: 200, body: { defaultValue: "Web", values: [{ value: "Web" }] } },
      { status: 200, body: { bugsBehavior: "off", backlogIteration: { path: "\\Release 1" } } },
      { status: 200, body: { value: [] } },
    );
    const settings = await azureDevops({ auth: { pat: "p" }, fetch }).teamSettings("acme", project, "t");
    expect(settings.bugsBehavior).toBe("off");
    expect(settings.backlogIteration).toBe("Web\\Release 1");
  });

  it("lists the types a report can become, leaving out hidden, test and disabled ones", async () => {
    const fetch = fakeFetch(
      {
        status: 200,
        body: {
          value: [
            { name: "User Story", color: "009CCC" },
            { name: "Bug", color: "CC293D" },
            { name: "Test Case" },
            { name: "Code Review Request" },
            { name: "Old", isDisabled: true },
          ],
        },
      },
      {
        status: 200,
        body: {
          value: [
            { referenceName: "Microsoft.HiddenCategory", workItemTypes: [{ name: "Code Review Request" }] },
            { referenceName: "Microsoft.TestCaseCategory", workItemTypes: [{ name: "Test Case" }] },
            { referenceName: "Microsoft.BugCategory", workItemTypes: [{ name: "Bug" }] },
          ],
        },
      },
    );
    const types = await azureDevops({ auth: { pat: "p" }, fetch }).workItemTypes("acme", "p-1");
    expect(types).toEqual([
      { name: "Bug", color: "CC293D" },
      { name: "User Story", color: "009CCC" },
    ]);
  });

  it("works out where a type's report goes and which required fields need a value", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: {
        value: [
          { referenceName: "System.Title", name: "Title", alwaysRequired: true },
          { referenceName: "System.State", name: "State", alwaysRequired: true, defaultValue: "New" },
          { referenceName: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps" },
          { referenceName: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info" },
          { referenceName: "Microsoft.VSTS.Common.Priority", name: "Priority", alwaysRequired: true },
          { referenceName: "Custom.Product", name: "Product", alwaysRequired: true, allowedValues: ["Store", "Admin"] },
          { referenceName: "Custom.Team", name: "Team", alwaysRequired: true, defaultValue: "Core" },
        ],
      },
    });
    const info = await azureDevops({ auth: { pat: "p" }, fetch }).workItemType("acme", "p-1", "Bug");

    expect(info).toEqual({
      bodyField: "Microsoft.VSTS.TCM.ReproSteps",
      systemInfoField: "Microsoft.VSTS.TCM.SystemInfo",
      hasPriority: true,
      required: [{ referenceName: "Custom.Product", name: "Product", allowedValues: ["Store", "Admin"] }],
    });
    expect(fetch.calls[0]!.url).toBe(
      "https://dev.azure.com/acme/p-1/_apis/wit/workitemtypes/Bug/fields?%24expand=allowedValues&api-version=7.1",
    );
  });

  it("falls back to Description for types without Repro Steps", async () => {
    const fetch = fakeFetch({ status: 200, body: { value: [{ referenceName: "System.Description" }] } });
    const info = await azureDevops({ auth: { pat: "p" }, fetch }).workItemType("acme", "p-1", "Issue");
    expect(info).toEqual({ bodyField: "System.Description", hasPriority: false, required: [] });
  });

  it("reads a type's states with their categories", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: { value: [{ name: "New", category: "Proposed", color: "b2b2b2" }, { name: "Active", category: "InProgress" }] },
    });
    const states = await azureDevops({ auth: { pat: "p" }, fetch }).workItemStates("acme", "p-1", "User Story");
    expect(states).toEqual([
      { name: "New", category: "Proposed" },
      { name: "Active", category: "InProgress" },
    ]);
    expect(fetch.calls[0]!.url).toBe("https://dev.azure.com/acme/p-1/_apis/wit/workitemtypes/User%20Story/states?api-version=7.1");
  });

  it("throws AzureDevopsApiError with Azure DevOps' message", async () => {
    const fetch = fakeFetch({ status: 404, body: { message: "TF200016: The project does not exist" } });
    const err = await azureDevops({ auth: { pat: "p" }, fetch })
      .teams("acme", "nope")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AzureDevopsApiError);
    expect(err).toMatchObject({ status: 404, message: "TF200016: The project does not exist" });
  });
});
