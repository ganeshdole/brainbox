import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "./authConfig.ts";
import {
  codeSignInUrl,
  fetchSignInOptions,
  isSignInCode,
  savePendingSignIn,
  takePendingSignIn,
} from "./sign-in.ts";

describe("codeSignInUrl", () => {
  it("sends the address the way Auth.js stored it, or a right code is refused", () => {
    const url = new URL(codeSignInUrl("  Ana@Example.COM ", "042137", "https://app.test/projects"));

    expect(`${url.origin}${url.pathname}`).toBe(`${API_URL}/api/auth/callback/magic-link`);
    expect(url.searchParams.get("email")).toBe("ana@example.com");
    expect(url.searchParams.get("token")).toBe("042137");
    expect(url.searchParams.get("callbackUrl")).toBe("https://app.test/projects");
  });
});

describe("isSignInCode", () => {
  it.each([
    ["042137", true],
    ["04213", false],
    ["0421370", false],
    ["04 213", false],
  ])("%s -> %s", (value, expected) => {
    expect(isSignInCode(value)).toBe(expected);
  });
});

describe("fetchSignInOptions", () => {
  afterEach(() => vi.unstubAllGlobals());

  function respond(body: unknown, ok = true) {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })));
  }

  it("reads the backend's mode and whether it offers Google", async () => {
    respond({ email: "code", google: false });
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "code", google: false });
  });

  it("reads a Google-only deployment, with email sign-in off", async () => {
    respond({ email: "off", google: true });
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "off", google: true });
  });

  it("offers Google unless the backend says it has none", async () => {
    respond({ email: "both" });
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "both", google: true });
  });

  it("falls back to links and Google for a backend that predates the settings", async () => {
    respond({ error: "Not found" }, false);
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "link", google: true });
  });

  it("falls back to links for an answer it does not know", async () => {
    respond({ email: "carrier-pigeon" });
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "link", google: true });
  });

  it("falls back to links when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(fetchSignInOptions()).resolves.toEqual({ email: "link", google: true });
  });
});

describe("pending code sign-in", () => {
  beforeEach(() => sessionStorage.clear());

  it("comes back once, with where it was headed", () => {
    savePendingSignIn({ email: "ana@example.com", callbackUrl: "https://app.test/claim?token=t" });

    expect(takePendingSignIn()).toEqual({
      email: "ana@example.com",
      callbackUrl: "https://app.test/claim?token=t",
    });
    expect(takePendingSignIn()).toBeNull();
  });

  it("ignores anything it did not write", () => {
    sessionStorage.setItem("brainbox:pendingSignIn", "not json");
    expect(takePendingSignIn()).toBeNull();
  });
});
