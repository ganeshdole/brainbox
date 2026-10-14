import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts reads process.env once, on import, so each case imports it afresh.
async function loadEnv(vars: Record<string, string>) {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  vi.resetModules();
  return (await import("./env.ts")).env;
}

const S3 = { STORAGE_DRIVER: "s3", S3_BUCKET: "feedback", S3_REGION: "eu-west-1" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("INTEGRATIONS_ENCRYPTION_KEY", () => {
  it("refuses to boot with a key that can't seal anything", async () => {
    await expect(loadEnv({ INTEGRATIONS_ENCRYPTION_KEY: "too-short" })).rejects.toThrow(/32 bytes/);
  });
});

describe("STORAGE_DRIVER=s3", () => {
  it("boots with both keys", async () => {
    const env = await loadEnv({ ...S3, S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "secret" });
    expect(env.S3_ACCESS_KEY_ID).toBe("id");
  });

  it("boots with neither key, for an IAM role", async () => {
    const env = await loadEnv({ ...S3, S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "" });
    expect(env.S3_ACCESS_KEY_ID).toBe("");
  });

  it("refuses to boot with only one of the keys", async () => {
    await expect(loadEnv({ ...S3, S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "" })).rejects.toThrow(
      /S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY/,
    );
    await expect(loadEnv({ ...S3, S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "secret" })).rejects.toThrow(
      /S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY/,
    );
  });

  it("refuses to boot without a bucket or region", async () => {
    await expect(loadEnv({ ...S3, S3_BUCKET: "" })).rejects.toThrow(/S3_BUCKET/);
    await expect(loadEnv({ ...S3, S3_REGION: "" })).rejects.toThrow(/S3_REGION/);
  });
});
