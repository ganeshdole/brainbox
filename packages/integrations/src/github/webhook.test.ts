import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyGithubSignature } from "./webhook.ts";

const secret = "whsec_test";
const body = JSON.stringify({ action: "deleted", installation: { id: 42 } });
const sign = (s: string, b: string) => `sha256=${createHmac("sha256", s).update(b).digest("hex")}`;

describe("verifyGithubSignature", () => {
  it("accepts a signature GitHub would send", async () => {
    expect(await verifyGithubSignature(body, sign(secret, body), secret)).toBe(true);
  });

  it("accepts upper-case hex", async () => {
    expect(await verifyGithubSignature(body, sign(secret, body).toUpperCase().replace("SHA256=", "sha256="), secret)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, and a missing or malformed header", async () => {
    expect(await verifyGithubSignature(body, sign("other", body), secret)).toBe(false);
    expect(await verifyGithubSignature(`${body} `, sign(secret, body), secret)).toBe(false);
    expect(await verifyGithubSignature(body, null, secret)).toBe(false);
    expect(await verifyGithubSignature(body, undefined, secret)).toBe(false);
    expect(await verifyGithubSignature(body, "sha1=abc", secret)).toBe(false);
    expect(await verifyGithubSignature(body, "sha256=nothex", secret)).toBe(false);
  });

  it("rejects everything when the secret is empty", async () => {
    expect(await verifyGithubSignature(body, sign("", body), "")).toBe(false);
  });
});
