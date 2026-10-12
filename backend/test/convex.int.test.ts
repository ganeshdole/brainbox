import { ConvexHttpClient } from "convex/browser";
import { describe, expect, it } from "vitest";

import { api } from "../convex/_generated/api.js";
import { getConvex } from "../src/convex-client.ts";
import { ConvexStorage } from "../src/storage/convex.ts";
import { TEST_STORE, testEnv } from "./env.ts";

// Convex-only behaviour; the shared suite covers the store itself.
describe.skipIf(TEST_STORE !== "convex")("Convex deployment", () => {
  it("refuses a call without the server secret", async () => {
    const outsider = new ConvexHttpClient(testEnv.CONVEX_URL!);
    await expect(outsider.query(api.projects.getByKey, { secret: "guess", key: "pk_x" })).rejects.toThrow(
      /Unauthorized/,
    );
  });

  it("stores files under Brainbox keys and serves the latest bytes", async () => {
    const storage = new ConvexStorage(getConvex());
    const key = "project/issue/screenshot.png";

    await storage.put(key, new Uint8Array([1, 2, 3]), "image/png");
    await storage.put(key, new Uint8Array([4, 5, 6, 7]), "image/png");

    const res = await fetch(await storage.presignGet(key));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([4, 5, 6, 7]);
  });

  it("has no URL for a key that was never stored", async () => {
    await expect(new ConvexStorage(getConvex()).presignGet("nothing/here.png")).rejects.toThrow(/no stored file/);
  });
});
