import { describe, expect, it } from "vitest";

import { getAuthConfig } from "../src/auth/config.ts";
import { env } from "../src/env.ts";
import { AUTH_ERROR_PATH } from "../src/routes/auth-error.ts";

// Auth.js's provider factories stash whatever you passed under `options` and
// merge it into the provider during init, so that is where these live before
// the framework has run.
function google() {
  const provider = getAuthConfig().providers.find((p) => "id" in p && p.id === "google");
  if (!provider || !("options" in provider)) {
    throw new Error("google provider is not registered");
  }
  return provider.options as {
    authorization?: { params?: Record<string, string> };
    allowDangerousEmailAccountLinking?: boolean;
  };
}

describe("google provider", () => {
  it("forces the account chooser", () => {
    // Without prompt=select_account Google silently reuses whichever account is
    // already signed in there, so signing out of Brainbox and back in returns
    // you to the SAME account - which reads as "log out is broken".
    expect(google().authorization?.params?.prompt).toBe("select_account");
  });

  it("links an existing user row by email instead of erroring", () => {
    // A `users` row with no Google `accounts` link (created by magic link, a
    // seed, or an import) otherwise makes Auth.js refuse with
    // OAuthAccountNotLinked and dump the user on /api/auth/error.
    expect(google().allowDangerousEmailAccountLinking).toBe(true);
  });
});

describe("pages", () => {
  it("routes sign-in and errors to the dashboard, not the API origin", () => {
    const { pages } = getAuthConfig();
    // Auth.js otherwise renders its own unbranded page on the API origin, which
    // is how a failed sign-in ended at app.brainbox.sh/api/auth/error showing a
    // bare code with no way back.
    expect(pages.signIn).toBe(`${env.DASHBOARD_ORIGIN}/login`);
    expect(pages.verifyRequest).toBe(`${env.DASHBOARD_ORIGIN}/login`);
    // A path on the API, which forwards to the dashboard: Auth.js prefixes this
    // one with the API's origin (test/auth-error.int.test.ts).
    expect(pages.error).toBe(AUTH_ERROR_PATH);
  });

  it("carries no query string of its own", () => {
    // Auth.js appends the incoming request's own `?...` verbatim, so a page URL
    // that already has a query comes out as `/login?a=1?b=2` and parses as
    // nonsense - the second param's name becomes part of the first one's value.
    for (const url of Object.values(getAuthConfig().pages)) {
      expect(url).not.toContain("?");
    }
  });
});

describe("redirect callback", () => {
  const redirect = getAuthConfig().callbacks.redirect;
  const apiOrigin = "http://localhost:8787";

  it("resolves a relative callbackUrl against the API", () => {
    expect(redirect({ url: "/billing", baseUrl: apiOrigin })).toBe(`${apiOrigin}/billing`);
  });

  it("keeps a same-origin callbackUrl", () => {
    const url = `${apiOrigin}/api/me`;
    expect(redirect({ url, baseUrl: apiOrigin })).toBe(url);
  });

  it("allows the dashboard even though it is a different origin", () => {
    // Auth.js's default silently discards a foreign origin and falls back to
    // the API root, which dumps every local sign-in on the bare API (5173 vs
    // 8787) and would break the moment the API moves to its own subdomain.
    const url = `${env.DASHBOARD_ORIGIN}/billing?plan=pro&period=annual`;
    expect(redirect({ url, baseUrl: apiOrigin })).toBe(url);
  });

  it("preserves the query string, so a plan survives the sign-in round trip", () => {
    const url = `${env.DASHBOARD_ORIGIN}/billing?plan=business&period=annual`;
    expect(redirect({ url, baseUrl: apiOrigin })).toContain("plan=business");
  });

  it("refuses an unrelated origin", () => {
    expect(redirect({ url: "https://evil.example/steal", baseUrl: apiOrigin })).toBe(
      env.DASHBOARD_ORIGIN,
    );
  });

  it("falls back safely on an unparseable url", () => {
    expect(redirect({ url: "not a url", baseUrl: apiOrigin })).toBe(env.DASHBOARD_ORIGIN);
  });
});
