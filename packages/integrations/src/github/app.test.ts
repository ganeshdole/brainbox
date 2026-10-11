import { beforeAll, describe, expect, it } from "vitest";

import { base64url, utf8 } from "../encoding.ts";
import { fakeFetch } from "../test/fake-fetch.ts";
import { githubApp } from "./app.ts";
import { GithubApiError } from "./client.ts";

let privateKeyPem = "";
let publicKey: Awaited<ReturnType<typeof crypto.subtle.importKey>>;

function pem(label: string, der: ArrayBuffer): string {
  const b64 = Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  privateKeyPem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  publicKey = pair.publicKey;
});

function decodeSegment(seg: string): unknown {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

const NOW = Date.UTC(2026, 9, 11, 9, 30, 0);

describe("githubApp.appJwt", () => {
  it("signs RS256 with the app id as issuer and a backdated iat", async () => {
    const app = githubApp({ appId: "12345", privateKey: privateKeyPem, now: () => NOW });
    const jwt = await app.appJwt();
    const [header, claims, signature] = jwt.split(".");

    expect(decodeSegment(header!)).toEqual({ alg: "RS256", typ: "JWT" });
    const nowSec = Math.floor(NOW / 1000);
    expect(decodeSegment(claims!)).toEqual({ iat: nowSec - 60, exp: nowSec + 540, iss: "12345" });

    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      Buffer.from(signature!, "base64url"),
      utf8(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it("rejects a PKCS#1 key with the conversion command", async () => {
    const pkcs1 = privateKeyPem.replace(/PRIVATE KEY/g, "RSA PRIVATE KEY");
    const app = githubApp({ appId: "1", privateKey: pkcs1 });
    await expect(app.appJwt()).rejects.toThrow(/openssl pkcs8 -topk8/);
  });
});

describe("githubApp.installationToken", () => {
  const expiresAt = new Date(NOW + 60 * 60 * 1000).toISOString();

  it("exchanges the app JWT for an installation token and caches it", async () => {
    const fetch = fakeFetch({ status: 201, body: { token: "ghs_1", expires_at: expiresAt } });
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch, now: () => NOW });

    expect(await app.installationToken(42)).toBe("ghs_1");
    expect(await app.installationToken("42")).toBe("ghs_1");

    expect(fetch.calls).toHaveLength(1);
    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://api.github.com/app/installations/42/access_tokens");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("refreshes when the cached token is within five minutes of expiry", async () => {
    let now = NOW;
    const fetch = fakeFetch(
      { status: 201, body: { token: "ghs_1", expires_at: expiresAt } },
      { status: 201, body: { token: "ghs_2", expires_at: expiresAt } },
    );
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch, now: () => now });

    expect(await app.installationToken(42)).toBe("ghs_1");
    now = NOW + 56 * 60 * 1000;
    expect(await app.installationToken(42)).toBe("ghs_2");
    expect(fetch.calls).toHaveLength(2);
  });

  it("throws GithubApiError with GitHub's message on failure", async () => {
    const fetch = fakeFetch({ status: 404, body: { message: "Not Found" } });
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch });
    const err = await app.installationToken(42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GithubApiError);
    expect((err as GithubApiError).status).toBe(404);
    expect((err as GithubApiError).message).toBe("Not Found");
  });
});

describe("githubApp.installation", () => {
  it("returns the id and the account it was installed on", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: { id: 42, account: { login: "acme", type: "Organization" } },
    });
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch });
    expect(await app.installation(42)).toEqual({
      id: 42,
      account: { login: "acme", type: "Organization" },
    });
    expect(fetch.calls[0]!.url).toBe("https://api.github.com/app/installations/42");
  });
});

describe("githubApp.installationRepos", () => {
  it("lists repos with the installation token, following pages", async () => {
    const repo = (i: number) => ({
      id: i,
      name: `r${i}`,
      full_name: `acme/r${i}`,
      private: i % 2 === 0,
      owner: { login: "acme" },
    });
    const page1 = Array.from({ length: 100 }, (_, i) => repo(i));
    const fetch = fakeFetch(
      { status: 201, body: { token: "ghs_1", expires_at: new Date(NOW + 3_600_000).toISOString() } },
      { status: 200, body: { total_count: 101, repositories: page1 } },
      { status: 200, body: { total_count: 101, repositories: [repo(100)] } },
    );
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch, now: () => NOW });

    const repos = await app.installationRepos(42);

    expect(repos).toHaveLength(101);
    expect(repos[0]).toEqual({ id: 0, name: "r0", owner: "acme", fullName: "acme/r0", private: true });
    expect(fetch.calls[1]!.headers.authorization).toBe("Bearer ghs_1");
    expect(fetch.calls[1]!.url).toContain("/installation/repositories?per_page=100&page=1");
    expect(fetch.calls[2]!.url).toContain("page=2");
  });

  it("stops after one page when the page is not full", async () => {
    const fetch = fakeFetch(
      { status: 201, body: { token: "ghs_1", expires_at: new Date(NOW + 3_600_000).toISOString() } },
      {
        status: 200,
        body: { total_count: 1, repositories: [{ id: 1, name: "r", full_name: "a/r", owner: { login: "a" } }] },
      },
    );
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch, now: () => NOW });
    expect(await app.installationRepos(42)).toEqual([
      { id: 1, name: "r", owner: "a", fullName: "a/r", private: false },
    ]);
    expect(fetch.calls).toHaveLength(2);
  });
});

describe("githubApp OAuth", () => {
  it("exchanges a setup code for a user token", async () => {
    const fetch = fakeFetch({ status: 200, body: { access_token: "ghu_1", token_type: "bearer" } });
    const app = githubApp({
      appId: "1",
      privateKey: privateKeyPem,
      clientId: "Iv1.abc",
      clientSecret: "shh",
      fetch,
    });

    expect(await app.userToken("code-123")).toBe("ghu_1");
    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://github.com/login/oauth/access_token");
    expect(call.headers.accept).toBe("application/json");
    expect(call.body).toEqual({ client_id: "Iv1.abc", client_secret: "shh", code: "code-123" });
  });

  it("throws GitHub's description for a bad code, and without client credentials", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." },
    });
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, clientId: "c", clientSecret: "s", fetch });
    await expect(app.userToken("x")).rejects.toThrow("The code passed is incorrect or expired.");

    const bare = githubApp({ appId: "1", privateKey: privateKeyPem });
    await expect(bare.userToken("x")).rejects.toThrow(/clientId and clientSecret/);
  });

  it("lists the user's installations with the user token", async () => {
    const fetch = fakeFetch({
      status: 200,
      body: {
        total_count: 2,
        installations: [
          { id: 42, account: { login: "acme", type: "Organization" } },
          { id: 43, account: { login: "jane", type: "User" } },
        ],
      },
    });
    const app = githubApp({ appId: "1", privateKey: privateKeyPem, fetch });

    expect(await app.userInstallations("ghu_1")).toEqual([
      { id: 42, account: { login: "acme", type: "Organization" } },
      { id: 43, account: { login: "jane", type: "User" } },
    ]);
    expect(fetch.calls[0]!.url).toBe("https://api.github.com/user/installations?per_page=100&page=1");
    expect(fetch.calls[0]!.headers.authorization).toBe("Bearer ghu_1");
  });
});

describe("base64url", () => {
  it("matches Node's encoding for bytes and strings", () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 250]);
    expect(base64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    expect(base64url("héllo")).toBe(Buffer.from("héllo").toString("base64url"));
  });
});
