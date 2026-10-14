import { Hono } from "hono";

import { getStorage } from "../storage/index.ts";
import { mimeForKey } from "../storage/mime.ts";
import type { AppEnv } from "../types.ts";

// Serves stored screenshot/audio bytes for a driver that reads them through
// this API (local). Elsewhere the presigned URL points straight at the store.
// Cookie-gated + ownership-checked.
export const filesRoute = new Hono<AppEnv>().get("/*", async (c) => {
  const uid = c.get("authUser").token?.sub;
  if (!uid) return c.json({ error: "Unauthorized" }, 401);

  const key = c.req.path.replace(/^\/api\/files\//, "");
  const projectId = key.split("/")[0];
  if (!projectId) return c.json({ error: "Not found" }, 404);

  const proj = await c.get("store").projects.get(projectId);
  if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);

  const storage = getStorage();
  if (!storage.read) return c.json({ error: "Not found" }, 404);
  let bytes: Uint8Array;
  try {
    bytes = await storage.read(key);
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
  // Copy into a fresh ArrayBuffer-backed view so it satisfies BodyInit.
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": mimeForKey(key) },
  });
});
