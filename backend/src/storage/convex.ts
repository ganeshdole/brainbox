import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import type { ConvexCaller } from "../convex-client.ts";
import type { Storage } from "./index.ts";

/**
 * Convex file storage (convex/files.ts), under the same "<project>/<issue>/<file>"
 * keys as every driver. The URLs it hands out are unguessable but do not
 * expire, unlike R2's hour-long presigned ones.
 */
export class ConvexStorage implements Storage {
  private readonly convex: ConvexCaller;

  constructor(convex: ConvexCaller) {
    this.convex = convex;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const uploadUrl = await this.convex.mutation(api.files.generateUploadUrl, {});
    const bytes = new Uint8Array(body.byteLength);
    bytes.set(body);
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
    });
    if (!res.ok) throw new Error(`Convex upload of ${key} failed: ${res.status}`);
    await this.convex.mutation(api.files.save, { key, storageId: storageIdFrom(await res.json()) });
  }

  async presignGet(key: string): Promise<string> {
    const url = await this.convex.query(api.files.url, { key });
    if (!url) throw new Error(`no stored file for ${key}`);
    return url;
  }
}

/** The id from Convex's upload response. Ids are branded strings; Convex
 *  validates this one again when `files.save` receives it. */
function storageIdFrom(body: unknown): Id<"_storage"> {
  const storageId =
    typeof body === "object" && body !== null && "storageId" in body ? body.storageId : undefined;
  if (typeof storageId !== "string") throw new Error("Convex upload returned no storageId");
  return storageId as Id<"_storage">;
}
