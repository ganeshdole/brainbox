import { getConvex } from "../convex-client.ts";
import { env } from "../env.ts";
import { ConvexStorage } from "./convex.ts";
import { LocalStorage } from "./local.ts";
import { R2Storage } from "./r2.ts";

export type StorageDriver = typeof env.STORAGE_DRIVER;

// Object storage for screenshots/audio.
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  // A URL the dashboard can use to fetch the object. R2 → a short-lived
  // presigned URL; Convex → its file URL; local → a cookie-gated /api/files route.
  presignGet(key: string): Promise<string>;
}

let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;
  instance = createStorage(env.STORAGE_DRIVER);
  return instance;
}

function createStorage(driver: StorageDriver): Storage {
  switch (driver) {
    case "r2":
      return new R2Storage();
    case "convex":
      return new ConvexStorage(getConvex());
    case "local":
      return new LocalStorage();
  }
}
