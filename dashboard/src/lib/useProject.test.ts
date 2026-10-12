import { describe, expect, it } from "vitest";
import type { Project } from "@ganeshdole/brainbox-shared";

import { homeTarget } from "./useProject.ts";

function project(id: string): Project {
  return { id, name: id, key: `pk_${id}`, allowedOrigins: [], createdAt: "2026-07-01T00:00:00Z" };
}

describe("homeTarget", () => {
  const two = [project("aaa"), project("bbb")];

  it("restores the all view when remembered and there are several projects", () => {
    expect(homeTarget(two, "all")).toBe("/projects/all");
  });

  it("ignores a remembered all view with a single project", () => {
    expect(homeTarget([project("aaa")], "all")).toBe("/projects/aaa");
  });

  it("restores the remembered project", () => {
    expect(homeTarget(two, "bbb")).toBe("/projects/bbb");
  });

  it("falls back to the first project for an unknown or absent memory", () => {
    expect(homeTarget(two, "deleted")).toBe("/projects/aaa");
    expect(homeTarget(two, null)).toBe("/projects/aaa");
  });

  it("returns null with no projects (onboarding)", () => {
    expect(homeTarget([], null)).toBeNull();
    expect(homeTarget([], "all")).toBeNull();
  });
});
