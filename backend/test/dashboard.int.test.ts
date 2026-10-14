import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { dashboardRoute } from "../src/routes/dashboard.ts";

// A built dashboard on disk: index.html plus a fingerprinted asset.
const dir = mkdtempSync(join(tmpdir(), "brainbox-dashboard-"));
mkdirSync(join(dir, "assets"));
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Dashboard</title>");
writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log('app')");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const route = dashboardRoute(dir);
const get = (path: string) => route.request(path);

describe("dashboard served by the API", () => {
  it("serves built files, caching fingerprinted assets forever", async () => {
    const res = await get("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log('app')");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("answers a client-side route, such as a deep link from a ticket, with index.html", async () => {
    const res = await get("/projects/p1/issues/i1");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>Dashboard</title>");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("never answers a path the API owns, even an unknown one", async () => {
    for (const path of ["/api/nope", "/api", "/ingest", "/f/token", "/auth-error", "/health"]) {
      expect((await get(path)).status).toBe(404);
    }
  });
});
