import { describe, expect, it } from "vitest";
import type { Project, Team, TeamRole } from "@ganeshdole/brainbox-shared";

import {
  assignableRoles,
  canAdmin,
  groupByTeam,
  inviteExpired,
  mayManage,
  newProjectTeam,
  onboardingTeam,
} from "./team.ts";

function project(id: string, teamId: string, role: TeamRole): Project {
  return {
    id,
    name: id,
    key: `pk_${id}`,
    allowedOrigins: [],
    team: { id: teamId, name: teamId, role },
    createdAt: "2026-07-01T00:00:00Z",
  };
}

describe("roles", () => {
  it("lets owners and admins administer", () => {
    expect(canAdmin("owner")).toBe(true);
    expect(canAdmin("admin")).toBe(true);
    expect(canAdmin("member")).toBe(false);
  });

  it("keeps owners to owners, as the API does", () => {
    expect(mayManage("owner", "owner", "member")).toBe(true);
    expect(mayManage("admin", "member", "admin")).toBe(true);
    expect(mayManage("admin", "admin")).toBe(true);
    expect(mayManage("admin", "member", "owner")).toBe(false);
    expect(mayManage("admin", "owner")).toBe(false);
    expect(mayManage("member", "member")).toBe(false);
  });

  it("offers only the roles the actor may give", () => {
    expect(assignableRoles("owner", "member")).toEqual(["owner", "admin", "member"]);
    expect(assignableRoles("admin", "member")).toEqual(["admin", "member"]);
    expect(assignableRoles("admin", "owner")).toEqual([]);
    expect(assignableRoles("member", "member")).toEqual([]);
  });
});

describe("inviteExpired", () => {
  it("is true from the expiry on", () => {
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(inviteExpired("2026-10-13T12:00:01Z", now)).toBe(false);
    expect(inviteExpired("2026-10-13T12:00:00Z", now)).toBe(true);
  });
});

describe("groupByTeam", () => {
  it("groups in the order Teams first appear", () => {
    const groups = groupByTeam([project("a", "t1", "owner"), project("b", "t2", "member"), project("c", "t1", "owner")]);
    expect(groups.map((g) => [g.team.id, g.projects.map((p) => p.id)])).toEqual([
      ["t1", ["a", "c"]],
      ["t2", ["b"]],
    ]);
  });
});

describe("newProjectTeam", () => {
  const mine = project("a", "mine", "owner");
  const theirs = project("b", "theirs", "member");

  it("adds to the current Team when the caller administers it", () => {
    expect(newProjectTeam(mine, [theirs, mine])).toBe("mine");
  });

  it("falls back to a Team the caller administers", () => {
    expect(newProjectTeam(theirs, [theirs, mine])).toBe("mine");
  });

  it("leaves it to the API when the caller administers no Team", () => {
    expect(newProjectTeam(theirs, [theirs])).toBeUndefined();
    expect(newProjectTeam(null, [])).toBeUndefined();
  });
});

describe("onboardingTeam", () => {
  const team = (id: string, role: TeamRole): Team => ({ id, name: id, role, createdAt: "2026-07-01T00:00:00Z" });

  it("picks the first Team the caller administers, even an empty one", () => {
    expect(onboardingTeam([team("theirs", "member"), team("acme", "admin")])?.id).toBe("acme");
  });

  it("leaves it to the API when the caller administers none", () => {
    expect(onboardingTeam([team("theirs", "member")])).toBeUndefined();
    expect(onboardingTeam([])).toBeUndefined();
  });
});
