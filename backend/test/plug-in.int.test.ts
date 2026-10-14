import { afterEach, describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { publicFileUrl } from "../src/lib/public-files.ts";
import { setStorage, type Storage } from "../src/storage/index.ts";
import { getStore, setStore } from "../src/store/index.ts";
import { authCookie, makeProject, makeUser } from "./helpers.ts";
import { testDeps } from "./harness.ts";

// What an entry gets from setStore()/setStorage(): its own database or file
// store, used by every route without the backend knowing what it is.

afterEach(() => {
  setStore(null);
  setStorage(null);
});

/** A file store that hands out its own URLs, like S3 or R2. */
function urlOnlyStorage(): Storage & { puts: string[] } {
  const puts: string[] = [];
  return {
    puts,
    put: async (key) => {
      puts.push(key);
    },
    presignGet: async (key) => `https://files.example.com/${key}?sig=1`,
  };
}

describe("setStorage()", () => {
  it("sends /f/ links to the store's own URL when it cannot read()", async () => {
    setStorage(urlOnlyStorage());
    const url = new URL(publicFileUrl(testDeps.options, "p/i/screenshot.png"));

    const res = await app.request(url.pathname);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://files.example.com/p/i/screenshot.png?sig=1");
  });

  it("has nothing for /api/files to stream when it cannot read()", async () => {
    setStorage(urlOnlyStorage());
    const me = await makeUser();
    const project = await makeProject(me.id);

    const res = await app.request(`/api/files/${project.id}/i/screenshot.png`, {
      headers: { cookie: await authCookie(me.id) },
    });
    expect(res.status).toBe(404);
  });

  it("streams through any store that can read()", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    setStorage({ ...urlOnlyStorage(), read: async () => bytes });

    const res = await app.request(new URL(publicFileUrl(testDeps.options, "p/i/screenshot.png")).pathname);
    expect(res.status).toBe(200);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});

describe("setStore()", () => {
  it("is the store every request uses", async () => {
    const me = await makeUser();
    const real = getStore();
    setStore({
      ...real,
      projects: {
        ...real.projects,
        listForTeams: async () => [],
      },
    });
    await makeProject(me.id);

    const res = await app.request("/api/projects", { headers: { cookie: await authCookie(me.id) } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
