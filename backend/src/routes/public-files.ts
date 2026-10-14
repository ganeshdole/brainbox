import { Hono } from "hono";

import { fileKeyFromToken } from "../lib/public-files.ts";
import { mimeForKey } from "../storage/mime.ts";
import type { AppEnv } from "../types.ts";

// Public, read-only, one file per signed token. Mounted before the auth gate.
export const publicFiles = new Hono<AppEnv>().get("/:token", async (c) => {
  const { storage, options } = c.get("deps");
  const key = fileKeyFromToken(c.req.param("token"), options.secret);
  if (!key) return c.json({ error: "Not found" }, 404);

  if (!storage.read) return c.redirect(await storage.presignGet(key), 302);
  let bytes: Uint8Array;
  try {
    bytes = await storage.read(key);
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": mimeForKey(key),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
