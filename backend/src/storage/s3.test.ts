import { describe, expect, it } from "vitest";

import { S3Storage } from "./s3.ts";

const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

// Presigning is local (no request goes out), so the URL shows which store,
// bucket and addressing style each option produced.
describe("S3Storage", () => {
  it("addresses AWS itself by bucket host name when no endpoint is set", async () => {
    const storage = new S3Storage({ bucket: "feedback", region: "eu-west-1", credentials });
    const url = new URL(await storage.presignGet("p/i/screenshot.png"));
    expect(url.host).toBe("feedback.s3.eu-west-1.amazonaws.com");
    expect(url.pathname).toBe("/p/i/screenshot.png");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/eu-west-1/s3/");
  });

  it("puts the bucket in the path on a custom endpoint with forcePathStyle", async () => {
    const storage = new S3Storage({
      bucket: "feedback",
      region: "us-east-1",
      endpoint: "http://minio.internal:9000",
      credentials,
      forcePathStyle: true,
    });
    const url = new URL(await storage.presignGet("p/i/audio.webm"));
    expect(url.origin).toBe("http://minio.internal:9000");
    expect(url.pathname).toBe("/feedback/p/i/audio.webm");
  });

  it("signs for the region it is given, such as R2's \"auto\"", async () => {
    const storage = new S3Storage({
      bucket: "feedback",
      region: "auto",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      credentials,
      forcePathStyle: true,
      checksumsWhenRequired: true,
    });
    const url = new URL(await storage.presignGet("p/i/screenshot.png"));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/");
  });
});
