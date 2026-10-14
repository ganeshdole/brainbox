import { describe, expect, it } from "vitest";

import { parseOrganization } from "./azure-devops.ts";

describe("parseOrganization", () => {
  it("finds the organization in whatever someone pastes", () => {
    expect(parseOrganization("contoso")).toBe("contoso");
    expect(parseOrganization(" https://dev.azure.com/contoso ")).toBe("contoso");
    expect(parseOrganization("https://dev.azure.com/contoso/Web/_boards/board/t/Web%20Team")).toBe("contoso");
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
