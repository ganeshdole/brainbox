import type { Storage } from "./types.ts";

/** The part of a Workers R2 binding this driver uses. Structural, so the
 *  backend needs no Workers type package: any `R2Bucket` satisfies it. */
export interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface R2BucketStorageOptions {
  /** Where this API is reachable: files are served from `<publicUrl>/api/files/`. */
  publicUrl: string;
}

/**
 * Cloudflare R2 through a Workers binding: no access keys, and nothing leaves
 * Cloudflare's network. A binding can't presign, so files are served the way
 * `LocalStorage` serves them, through the cookie-gated `/api/files/` route,
 * which checks project access before streaming the bytes. Same key scheme as
 * every driver. Outside a Worker, use `STORAGE_DRIVER=r2` (the S3 API).
 */
export class R2BucketStorage implements Storage {
  private readonly bucket: R2BucketLike;
  private readonly publicUrl: string;

  constructor(bucket: R2BucketLike, options: R2BucketStorageOptions) {
    this.bucket = bucket;
    this.publicUrl = options.publicUrl;
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async presignGet(key: string): Promise<string> {
    return `${this.publicUrl}/api/files/${key}`;
  }

  async read(key: string): Promise<Uint8Array> {
    const object = await this.bucket.get(key);
    if (!object) throw new Error(`${key} is not in the bucket`);
    return new Uint8Array(await object.arrayBuffer());
  }
}
