import { getConvex } from "../convex-client.ts";
import { env } from "../env.ts";
import { ConvexStorage } from "./convex.ts";
import { LocalStorage } from "./local.ts";
import { S3Storage } from "./s3.ts";
import type { Storage } from "./types.ts";

export type StorageDriver = typeof env.STORAGE_DRIVER;
export { S3Storage, type S3Options } from "./s3.ts";
export { readStored, type Storage } from "./types.ts";

let instance: Storage | null = null;

/** The deployment's file storage (STORAGE_DRIVER), created on first use.
 *  Only the env-built app (`fromEnv()`) uses it; `createApp` takes its own. */
export function getStorage(): Storage {
  instance ??= createStorage(env.STORAGE_DRIVER);
  return instance;
}

/**
 * Use `storage` instead of the STORAGE_DRIVER one in the env-built app
 * (STORAGE_DRIVER=custom). `null` goes back to the configured driver.
 * @deprecated Pass `storage` to `createApp()` instead.
 */
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
      return new LocalStorage({ publicUrl: env.PUBLIC_API_URL });
    case "custom":
      throw new Error("STORAGE_DRIVER=custom, but no storage was given to setStorage()");
  }
}

/** STORAGE_DRIVER=s3: the S3_* settings. */
function s3FromEnv(): S3Storage {
  return new S3Storage({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
    ...(env.S3_ACCESS_KEY_ID && {
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    }),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

/** STORAGE_DRIVER=r2: Cloudflare R2, which is S3 with a fixed shape. */
function r2FromEnv(): S3Storage {
  return new S3Storage({
    bucket: env.R2_BUCKET,
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
    checksumsWhenRequired: true,
  });
}
