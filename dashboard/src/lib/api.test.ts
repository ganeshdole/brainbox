import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// api.ts keeps a module-level latch, so every test needs a fresh import.
async function freshApi() {
  vi.resetModules();
  return import("./api.ts");
}

/** Replace window.location with something assignable - jsdom refuses to
 *  navigate, and the assignment is exactly what we're asserting on. */
function stubLocation(pathname: string): { href: string; pathname: string } {
  const loc = { href: `http://localhost${pathname}`, pathname };
  Object.defineProperty(window, "location", {
    value: loc,
    writable: true,
    configurable: true,
  });
  return loc;
}

function respondWith(status: number) {
  return vi.fn(async () =>
    new Response(JSON.stringify({ error: "nope" }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const realLocation = window.location;

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: realLocation,
    writable: true,
    configurable: true,
  });
  vi.unstubAllGlobals();
});

describe("401 handling", () => {
  beforeEach(() => stubLocation("/projects/all"));

  it("does not redirect for the login page's public sign-in options", async () => {
    // A backend older than /api/sign-in-options answers 401. Sending the login
    // page to /login for it would reload the page, which asks again, forever.
    const loc = stubLocation("/login");
    vi.stubGlobal("fetch", respondWith(401));
    const { api, isAuthRedirect } = await freshApi();

    const err = await api.getSignInOptions().catch((e: unknown) => e);

    expect(loc.href).toBe("http://localhost/login");
    expect(isAuthRedirect(err)).toBe(false);
  });

  it("redirects to /login and throws a recognisable error", async () => {
    const loc = stubLocation("/projects/all");
    vi.stubGlobal("fetch", respondWith(401));
    const { api, isAuthRedirect } = await freshApi();

    const err = await api.listProjects().catch((e: unknown) => e);

    expect(loc.href).toBe("/login");
    expect(isAuthRedirect(err)).toBe(true);
  });

  it("navigates ONCE when a fan-out of requests all fail", async () => {
    // The all-projects view issues one request per project. Before the latch
    // each failure assigned window.location independently, so N dead requests
    // meant N navigations and N error banners.
    const loc = stubLocation("/projects/all");
    vi.stubGlobal("fetch", respondWith(401));
    const { api, isAuthRedirect } = await freshApi();

    const setHref = vi.fn();
    Object.defineProperty(loc, "href", {
      set: setHref,
      get: () => "http://localhost/projects/all",
      configurable: true,
    });

    const results = await Promise.allSettled([
      api.listIssues("a"),
      api.listIssues("b"),
      api.listIssues("c"),
      api.listIssues("d"),
    ]);

    expect(setHref).toHaveBeenCalledTimes(1);
    expect(setHref).toHaveBeenCalledWith("/login");
    // Every caller still rejects, so none of them proceeds with no data.
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    for (const r of results) {
      if (r.status === "rejected") expect(isAuthRedirect(r.reason)).toBe(true);
    }
  });
});

describe("402 handling", () => {
  it("sends an unpaid account to the plan picker", async () => {
    const loc = stubLocation("/projects/all");
    vi.stubGlobal("fetch", respondWith(402));
    const { api, isAuthRedirect } = await freshApi();

    const err = await api.listProjects().catch((e: unknown) => e);

    expect(loc.href).toBe("/billing");
    expect(isAuthRedirect(err)).toBe(true);
  });

  it("does not redirect when already on /billing, so the page can show the error", async () => {
    const loc = stubLocation("/billing");
    vi.stubGlobal("fetch", respondWith(402));
    const { api, isAuthRedirect } = await freshApi();

    const err = await api.listProjects().catch((e: unknown) => e);

    expect(loc.href).toBe("http://localhost/billing");
    // A real error here, not a redirect sentinel: nothing is navigating, so the
    // page must render it or the user sees a silent dead end.
    expect(isAuthRedirect(err)).toBe(false);
    expect((err as Error).message).toBe("Subscription required");
  });
});

describe("ordinary failures", () => {
  it("surfaces the server's message and is not treated as a redirect", async () => {
    stubLocation("/projects/all");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { api, isAuthRedirect } = await freshApi();

    const err = await api.getProject("nope").catch((e: unknown) => e);

    expect((err as Error).message).toBe("Project not found");
    expect(isAuthRedirect(err)).toBe(false);
  });
});

describe("integration requests", () => {
  function recordingFetch(body: unknown) {
    return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }

  it("starts a GitHub install for a project", async () => {
    const fetch = recordingFetch({ url: "https://github.com/apps/x/installations/new?state=s" });
    vi.stubGlobal("fetch", fetch);
    const { api } = await freshApi();

    expect(await api.startGithubInstall("p1")).toEqual({
      url: "https://github.com/apps/x/installations/new?state=s",
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/api\/integrations\/github\/install$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ projectId: "p1" });
  });

  it("saves a destination with PUT under the project and provider", async () => {
    const fetch = recordingFetch({});
    vi.stubGlobal("fetch", fetch);
    const { api } = await freshApi();

    await api.saveDestination("p1", "github", {
      connectionId: "c1",
      config: { owner: "acme", repo: "web", labels: ["bug"] },
      enabled: true,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/api\/projects\/p1\/destinations\/github$/);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      connectionId: "c1",
      config: { owner: "acme", repo: "web", labels: ["bug"] },
      enabled: true,
    });
  });

  it("sends an issue with POST to its deliveries", async () => {
    const fetch = recordingFetch([]);
    vi.stubGlobal("fetch", fetch);
    const { api } = await freshApi();

    await api.sendIssue("i1");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toMatch(/\/api\/issues\/i1\/deliveries$/);
    expect(init?.method).toBe("POST");
  });
});
