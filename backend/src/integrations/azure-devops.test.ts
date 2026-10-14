import { describe, expect, it } from "vitest";

import { parseOrganization } from "./azure-devops.ts";

describe("parseOrganization", () => {
  it("finds the organization in whatever someone pastes", () => {
    expect(parseOrganization("hapivetAI")).toBe("hapivetAI");
    expect(parseOrganization(" https://dev.azure.com/hapivetAI ")).toBe("hapivetAI");
    expect(parseOrganization("https://dev.azure.com/hapivetAI/hapivet/_boards/board/t/hapivet%20Team")).toBe("hapivetAI");
    expect(parseOrganization("dev.azure.com/acme/")).toBe("acme");
    expect(parseOrganization("https://acme.visualstudio.com/DefaultCollection")).toBe("acme");
  });

  it("refuses anything that isn't an Azure DevOps organization", () => {
    expect(parseOrganization("")).toBeNull();
    expect(parseOrganization("https://dev.azure.com/")).toBeNull();
    expect(parseOrganization("https://github.com/acme")).toBeNull();
    expect(parseOrganization("acme corp")).toBeNull();
    expect(parseOrganization("https://dev.azure.com/acme%2Fcorp")).toBeNull();
  });
});
