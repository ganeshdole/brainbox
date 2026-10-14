import { describe, expect, it } from "vitest";

import { base64url } from "../encoding.ts";
import { fakeFetch } from "../test/fake-fetch.ts";
import { AZURE_DEVOPS_SCOPE, EntraError, entraApp, pkcePair } from "./entra.ts";

const options = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://api.brainbox.sh/api/integrations/azure-devops/callback",
  now: () => 1_000_000,
};

function idToken(claims: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: "RS256" }))}.${base64url(JSON.stringify(claims))}.sig`;
}

function form(body: unknown): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body as string));
}

describe("entraApp", () => {
  it("builds the authorize URL with PKCE for any work or school account", () => {
    const url = new URL(entraApp(options).authorizeUrl({ state: "st", codeChallenge: "ch" }));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-1",
      response_type: "code",
      redirect_uri: options.redirectUri,
      response_mode: "query",
      scope: `${AZURE_DEVOPS_SCOPE} offline_access openid profile email`,
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("exchanges a code for tokens and reads who signed in", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: {
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3599,
        id_token: idToken({ tid: "tenant-1", oid: "user-1", name: "Ana Lima", preferred_username: "ana@acme.co" }),
      },
    });
    const tokens = await entraApp({ ...options, tenant: "tenant-1", fetch }).exchangeCode("code-1", "verifier-1");

    expect(tokens).toEqual({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1_000_000 + 3_599_000,
      account: { tenantId: "tenant-1", objectId: "user-1", name: "Ana Lima", username: "ana@acme.co" },
    });
    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    expect(call.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(form(call.body)).toMatchObject({
      client_id: "client-1",
      client_secret: "secret-1",
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
      redirect_uri: options.redirectUri,
    });
  });

  it("refreshes, keeping the old refresh token when Microsoft sends none", async () => {
    const fetch = fakeFetch({ status: 200, body: { access_token: "at-2", expires_in: 60 } });
    const tokens = await entraApp({ ...options, fetch }).refresh("rt-1");

    expect(tokens).toEqual({ accessToken: "at-2", refreshToken: "rt-1", expiresAt: 1_060_000 });
    expect(form(fetch.calls[0]!.body)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "rt-1",
      scope: `${AZURE_DEVOPS_SCOPE} offline_access`,
    });
  });

  it("throws EntraError with Microsoft's code, so a dead refresh token is recognisable", async () => {
    const fetch = fakeFetch({
      status: 400,
      body: {
        error: "invalid_grant",
        error_description: "AADSTS700082: The refresh token has expired.\r\nTrace ID: 1\r\nCorrelation ID: 2",
      },
    });
    const err = await entraApp({ ...options, fetch })
      .refresh("old")
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EntraError);
    expect(err).toMatchObject({
      status: 400,
      code: "invalid_grant",
      message: "AADSTS700082: The refresh token has expired.",
    });
  });
});

describe("pkcePair", () => {
  it("makes an S256 challenge of the verifier", async () => {
    const { verifier, challenge } = await pkcePair();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(base64url(new Uint8Array(digest)));
  });
});
