import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { projects } from "../db/schema/index.ts";
import { getStorage } from "../storage/index.ts";
import { LocalStorage } from "../storage/local.ts";
import { mimeForKey } from "../storage/mime.ts";
import type { AppEnv } from "../types.ts";

// Serves locally-stored screenshot/audio bytes (LocalStorage driver only - under
// R2 the presigned URL points straight at R2). Cookie-gated + ownership-checked.
export const filesRoute = new Hono<AppEnv>().get("/*", async (c) => {
  const uid = c.get("authUser").token?.sub;
  if (!uid) return c.json({ error: "Unauthorized" }, 401);

  const key = c.req.path.replace(/^\/api\/files\//, "");
  const projectId = key.split("/")[0];
  if (!projectId) return c.json({ error: "Not found" }, 404);

  const db = c.get("db");
  const [proj] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj || proj.ownerId !== uid) return c.json({ error: "Not found" }, 404);

  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) {
    return c.json({ error: "Not found" }, 404);
  }
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
