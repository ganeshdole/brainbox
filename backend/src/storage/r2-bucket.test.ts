import { describe, expect, it } from "vitest";

import { R2BucketStorage, type R2BucketLike } from "./r2-bucket.ts";

/** An in-memory stand-in for a Workers R2 binding. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string | undefined }>();
  const bucket: R2BucketLike = {
    async put(key, value, options) {
      objects.set(key, { body: value.slice(), contentType: options?.httpMetadata?.contentType });
      return {};
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return { arrayBuffer: async () => object.body.slice().buffer };
    },
  };
  return { bucket, objects };
}

describe("R2BucketStorage", () => {
  it("stores bytes with their content type and reads them back", async () => {
    const { bucket, objects } = fakeBucket();
    const storage = new R2BucketStorage(bucket, { publicUrl: "https://app.example.com" });
    await storage.put("p/i/screenshot.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(objects.get("p/i/screenshot.png")?.contentType).toBe("image/png");
    expect(Array.from(await storage.read("p/i/screenshot.png"))).toEqual([1, 2, 3]);
  });

  it("points the dashboard at this API's access-checked file route", async () => {
    const storage = new R2BucketStorage(fakeBucket().bucket, { publicUrl: "https://app.example.com" });
    expect(await storage.presignGet("p/i/audio.webm")).toBe("https://app.example.com/api/files/p/i/audio.webm");
  });

  it("throws for a missing key, which the file routes answer with 404", async () => {
    const storage = new R2BucketStorage(fakeBucket().bucket, { publicUrl: "https://app.example.com" });
    await expect(storage.read("p/i/nope.png")).rejects.toThrow("not in the bucket");
  });
});
