import { Hono } from "hono";

import { projectAccess } from "../lib/access.ts";
import { getStorage } from "../storage/index.ts";
import { mimeForKey } from "../storage/mime.ts";
import type { AppEnv } from "../types.ts";

// Serves stored screenshot/audio bytes for a driver that reads them through
// this API (local). Elsewhere the presigned URL points straight at the store.
// Cookie-gated, and only for members of the project's Team.
export const filesRoute = new Hono<AppEnv>().get("/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, "");
  const projectId = key.split("/")[0];
  if (!projectId) return c.json({ error: "Not found" }, 404);

  const access = await projectAccess(c, projectId, "member");
  if (access instanceof Response) return access;

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
