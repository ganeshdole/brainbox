import { getConvex } from "../convex-client.ts";
import { env } from "../env.ts";
import { ConvexStorage } from "./convex.ts";
import { LocalStorage } from "./local.ts";
import { r2FromEnv, s3FromEnv } from "./s3.ts";

export type StorageDriver = typeof env.STORAGE_DRIVER;
export { S3Storage, type S3Options } from "./s3.ts";

// Object storage for screenshots/audio.
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

let instance: Storage | null = null;

export function getStorage(): Storage {
  instance ??= createStorage(env.STORAGE_DRIVER);
  return instance;
}

/** Use `storage` instead of the STORAGE_DRIVER one: how an entry plugs in a
 *  store this repo does not ship (STORAGE_DRIVER=custom). Call it before
 *  serving. `null` goes back to the configured driver. */
export function setStorage(storage: Storage | null): void {
  instance = storage;
}

function createStorage(driver: StorageDriver): Storage {
  switch (driver) {
    case "s3":
      return s3FromEnv();
    case "r2":
      return r2FromEnv();
    case "convex":
      return new ConvexStorage(getConvex());
    case "local":
      return new LocalStorage();
    case "custom":
      throw new Error("STORAGE_DRIVER=custom, but no storage was given to setStorage()");
  }
}
