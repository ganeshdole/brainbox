// Object storage for screenshots, recordings, sessions and audio.
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  // A URL the dashboard can use to fetch the object. S3/R2 → a short-lived
  // presigned URL; Convex → its file URL; local → a cookie-gated /api/files route.
  presignGet(key: string): Promise<string>;
  // The stored bytes. Only for a driver whose presignGet points back at this
  // API (local): the file routes stream from read() when it exists, and
  // redirect to presignGet when it does not.
  read?(key: string): Promise<Uint8Array>;
}

/** A stored file's bytes from any driver: read() where there is one, else its
 *  presigned URL. For handing a file to a tracker that keeps its own copy. */
export async function readStored(storage: Storage, key: string): Promise<Uint8Array> {
  if (storage.read) return storage.read(key);
  const res = await fetch(await storage.presignGet(key));
  if (!res.ok) throw new Error(`reading ${key} from storage failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
