import { describe, expect, it } from "vitest";

import { isEncryptionKey, openCredentials, sealCredentials } from "./credentials.ts";

const key = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));
const otherKey = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 255 - i)));

describe("credentials", () => {
  it("seals to an opaque versioned string and opens back", async () => {
    const plain = JSON.stringify({ kind: "pat", token: "secret-pat-value" });
    const sealed = await sealCredentials(plain, { key, context: "conn-1" });

    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("secret-pat-value");
    expect(await openCredentials(sealed, { key, context: "conn-1" })).toBe(plain);
  });

  it("uses a fresh IV every time", async () => {
    const a = await sealCredentials("x", { key, context: "c" });
    const b = await sealCredentials("x", { key, context: "c" });
    expect(a).not.toBe(b);
  });

  it("does not open for another connection, another key, or a tampered value", async () => {
    const sealed = await sealCredentials("token", { key, context: "conn-1" });

    await expect(openCredentials(sealed, { key, context: "conn-2" })).rejects.toThrow();
    await expect(openCredentials(sealed, { key: otherKey, context: "conn-1" })).rejects.toThrow();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith("A") ? "B" : "A"}A`;
    await expect(openCredentials(tampered, { key, context: "conn-1" })).rejects.toThrow();
    await expect(openCredentials("v2.a.b", { key, context: "conn-1" })).rejects.toThrow(
      "unrecognised sealed credentials",
    );
  });

  it("accepts only a 32-byte base64 key", async () => {
    expect(isEncryptionKey(key)).toBe(true);
    expect(isEncryptionKey(btoa("short"))).toBe(false);
    expect(isEncryptionKey("not base64!")).toBe(false);
    await expect(sealCredentials("x", { key: btoa("short"), context: "c" })).rejects.toThrow(
      "INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes",
    );
  });
});
