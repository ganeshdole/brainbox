import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { FAILED_CODES_WINDOW_MS, MAX_FAILED_CODES } from "../src/auth/code-attempts.ts";
import { generateSignInCode, getAuthConfig } from "../src/auth/config.ts";
import { signInCodeEmail } from "../src/email/templates/sign-in-code.ts";
import { env } from "../src/env.ts";
import { getStore } from "../src/store/index.ts";

// The suite runs with AUTH_EMAIL_MODE=link, so codes are issued here the way
// Auth.js issues them in code mode: through the configured adapter, hashed
// with the secret. Everything after that is the real callback.

const EMAIL = "vet@clinic.test";

async function issueCode(email: string, code: string): Promise<void> {
  const { createVerificationToken } = getAuthConfig().adapter;
  await createVerificationToken?.({
    identifier: email,
    token: createHash("sha256").update(`${code}${env.AUTH_SECRET}`).digest("hex"),
    expires: new Date(Date.now() + 15 * 60_000),
  });
}

/** Submits a code the way the dashboard does; true when it signed in. */
async function signInWith(code: string, email: string | null = EMAIL): Promise<boolean> {
  const query = new URLSearchParams({ token: code, ...(email && { email }) });
  const res = await app.request(`/api/auth/callback/magic-link?${query}`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  return !location.includes("/auth-error") && (res.headers.get("set-cookie") ?? "").includes("session-token");
}

async function guessWrong(times: number): Promise<void> {
  for (let i = 0; i < times; i++) expect(await signInWith("000000")).toBe(false);
}

describe("signing in with a code", () => {
  afterEach(() => vi.useRealTimers());

  it("works with the right code, once", async () => {
    await issueCode(EMAIL, "042137");

    expect(await signInWith("042137")).toBe(true);
    expect(await signInWith("042137")).toBe(false);
  });

  it("refuses a code sent without its email, since codes are only unique per email", async () => {
    await issueCode(EMAIL, "042137");

    expect(await signInWith("042137", null)).toBe(false);
    expect(await signInWith("042137")).toBe(true);
  });

  it("refuses a code issued to someone else", async () => {
    await issueCode("other@clinic.test", "042137");

    expect(await signInWith("042137")).toBe(false);
  });

  it(`stops every pending code after ${MAX_FAILED_CODES} wrong guesses`, async () => {
    await issueCode(EMAIL, "042137");
    await guessWrong(MAX_FAILED_CODES);

    expect(await signInWith("042137")).toBe(false);
  });

  it("gives a new code no extra guesses, so asking for codes cannot reset the limit", async () => {
    await issueCode(EMAIL, "042137");
    await guessWrong(MAX_FAILED_CODES - 1);
    await issueCode(EMAIL, "731902");
    await guessWrong(1);
    await issueCode(EMAIL, "580214");

    expect(await signInWith("580214")).toBe(false);
  });

  it("accepts codes again once the window has passed", async () => {
    await issueCode(EMAIL, "042137");
    await guessWrong(MAX_FAILED_CODES);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + FAILED_CODES_WINDOW_MS + 1000);
    await issueCode(EMAIL, "731902");

    expect(await signInWith("731902")).toBe(true);
  });

  it("forgets earlier wrong guesses after a successful sign-in", async () => {
    await issueCode(EMAIL, "042137");
    await guessWrong(MAX_FAILED_CODES - 1);
    expect(await signInWith("042137")).toBe(true);

    await issueCode(EMAIL, "731902");
    await guessWrong(MAX_FAILED_CODES - 1);
    expect(await signInWith("731902")).toBe(true);
  });

  it("stores nothing for guesses at an address with no code pending", async () => {
    expect(await signInWith("000000", "nobody@clinic.test")).toBe(false);

    expect(await getStore().signIn.failedCodes("nobody@clinic.test", new Date(0))).toBe(0);
  });
});

describe("generateSignInCode", () => {
  it("is six digits, keeping leading zeros", () => {
    for (let i = 0; i < 200; i++) expect(generateSignInCode()).toMatch(/^\d{6}$/);
  });
});

describe("signInCodeEmail", () => {
  it("puts the code in both parts, and the expiry", () => {
    const mail = signInCodeEmail("042137", null, 15);
    expect(mail.html).toContain("042137");
    expect(mail.text).toContain("042137");
    expect(mail.text).toContain("15 minutes");
  });

  it("offers the link only when the deployment sends both", () => {
    const url = "https://api.test/api/auth/callback/magic-link?token=042137";
    expect(signInCodeEmail("042137", null, 15).html).not.toContain("href=");
    expect(signInCodeEmail("042137", url, 15).html).toContain(`href="${url}"`);
    expect(signInCodeEmail("042137", url, 15).text).toContain(url);
  });
});

describe("GET /api/sign-in-options", () => {
  it("tells the signed-out login page how email sign-in works", async () => {
    const res = await app.request("/api/sign-in-options");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "link" });
  });
});
