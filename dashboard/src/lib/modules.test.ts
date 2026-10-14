import { describe, expect, it } from "vitest";

import { ALL_MODULES, modulesFrom } from "./modules.ts";

describe("modulesFrom", () => {
  it("is what /api/me lists", () => {
    expect([...modulesFrom({ modules: ["teams", "billing"] })]).toEqual(["teams", "billing"]);
  });

  it("is nothing optional for a backend of only the core", () => {
    expect(modulesFrom({ modules: [] }).size).toBe(0);
  });

  it("is everything for a backend from before modules were listed", () => {
    expect([...modulesFrom({ user: { email: "a@b.c" } })]).toEqual([...ALL_MODULES]);
    expect([...modulesFrom(null)]).toEqual([...ALL_MODULES]);
  });

  it("ignores modules this dashboard doesn't know", () => {
    expect([...modulesFrom({ modules: ["features", "chat", 7] })]).toEqual(["features"]);
  });
});
