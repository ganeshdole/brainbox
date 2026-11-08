import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@ganeshdole/brainbox-shared";

const listProjects = vi.fn<() => Promise<Project[]>>();

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { listProjects } };
});

const { landingFor } = await import("./invites");
const { AuthRedirectError } = await import("./api");

function project(id: string, teamId: string): Project {
  return {
    id,
    name: id,
    key: `pk_${id}`,
    allowedOrigins: [],
    team: { id: teamId, name: "Team", role: "member" },
    createdAt: "2026-07-01T00:00:00Z",
  };
}

describe("landingFor", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => listProjects.mockReset());

  it("lands on the joined Team's project and remembers it", async () => {
    listProjects.mockResolvedValue([project("mine", "t0"), project("theirs", "t1")]);
    await expect(landingFor("t1")).resolves.toBe("/projects/theirs");
    expect(localStorage.getItem("brainbox:lastProject")).toBe("theirs");
  });

  it("lands on the Team page when it has no projects", async () => {
    listProjects.mockResolvedValue([project("mine", "t0")]);
    await expect(landingFor("t1")).resolves.toBe("/teams/t1");
  });

  it("still lands somewhere when the projects can't be listed - the invite is used", async () => {
    listProjects.mockRejectedValue(new Error("HTTP 500"));
    await expect(landingFor("t1")).resolves.toBe("/teams/t1");
  });

  it("lets a sign-in redirect through", async () => {
    listProjects.mockRejectedValue(new AuthRedirectError("Unauthorized"));
    await expect(landingFor("t1")).rejects.toBeInstanceOf(AuthRedirectError);
  });
});
