import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

// env.ts refuses to load without AUTH_SECRET, so these imports would throw if
// anything they reach read the environment.
describe("the parts entry", () => {
  it("reads nothing from the environment", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_SECRET", "");
    await expect(import("./env.ts")).rejects.toThrow(/AUTH_SECRET/);
    vi.resetModules();
    const parts = await import("./parts.ts");
    expect(typeof parts.createApp).toBe("function");
  });

  it("builds a working app from a store, storage and settings alone", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_SECRET", "");
    const { createApp, LocalStorage } = await import("./parts.ts");
    const app = createApp({
      store: {
        projects: {
          listForTeams: async () => [],
          create: async () => {
            throw new Error("unused");
          },
          get: async () => null,
          getByKey: async () => null,
          update: async () => null,
          delete: async () => {},
        },
        issues: {
          listForProject: async () => [],
          get: async () => null,
          create: async () => {},
          setTranscript: async () => {},
        },
      },
      storage: new LocalStorage({ publicUrl: "http://localhost:8787" }),
      options: { secret: "s", publicUrl: "http://localhost:8787", dashboardOrigin: "http://localhost:5173" },
    });
    expect(await (await app.request("/health")).json()).toEqual({ ok: true });
    const fd = new FormData();
    const metadata = {
      url: "http://host/app",
      title: "App",
      viewport: { width: 800, height: 600 },
      devicePixelRatio: 1,
      userAgent: "UA",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
    };
    fd.append("json", JSON.stringify({ projectKey: "pk_none", kind: "feature", text: "hi", metadata }));
    // Through parsing to the store, which knows no such project.
    expect((await app.request("/ingest", { method: "POST", body: fd })).status).toBe(401);
  });
});
