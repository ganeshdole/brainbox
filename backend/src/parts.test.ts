import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("makes a backend with no database: reports in memory, files on disk", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_SECRET", "");
    const { createApp, createMemoryStore, LocalStorage } = await import("./parts.ts");
    const { generateProjectKey } = await import("./lib/projectKey.ts");
    const store = createMemoryStore();
    const dir = await mkdtemp(join(tmpdir(), "brainbox-parts-"));
    const app = createApp({
      store,
      storage: new LocalStorage({ publicUrl: "http://localhost:8787", dir }),
      options: { secret: "s", publicUrl: "http://localhost:8787", dashboardOrigin: "http://localhost:5173" },
    });
    const project = await store.projects.create({
      teamId: "mine",
      name: "Shop",
      key: generateProjectKey(),
      allowedOrigins: [],
    });

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
    fd.append("json", JSON.stringify({ projectKey: project.key, text: "broken", metadata }));
    fd.append("screenshot", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "s.png", { type: "image/png" }));
    const res = await app.request("/ingest", { method: "POST", body: fd });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const [issue] = await store.issues.listForProject(project.id);
    expect(issue).toMatchObject({ id, text: "broken", status: "new" });
    expect((await app.request("/health")).status).toBe(200);
  });
});
