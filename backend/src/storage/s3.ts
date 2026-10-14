import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../env.ts";
import type { Storage } from "./index.ts";

export interface S3Options {
  bucket: string;
  region: string;
  /** Unset: AWS itself. Set for anything else that speaks S3 (R2, MinIO,
   *  Supabase Storage, Backblaze B2, DigitalOcean Spaces). */
  endpoint?: string;
  /** Unset: the SDK's own credential chain (an IAM role on Lambda or ECS). */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** `bucket` in the path rather than the host name. MinIO and Supabase need it. */
  forcePathStyle?: boolean;
  /** Send checksums only when an operation requires them. R2 rejects the
   *  CRC32 checksum the SDK adds by default since v3.729. */
  checksumsWhenRequired?: boolean;
}

/** Any S3-compatible object store. Objects stay private; the dashboard gets
 *  hour-long presigned URLs. */
export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3Options) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint && { endpoint: options.endpoint }),
      ...(options.credentials && { credentials: options.credentials }),
      forcePathStyle: options.forcePathStyle ?? false,
      ...(options.checksumsWhenRequired && { requestChecksumCalculation: "WHEN_REQUIRED" }),
    });
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async presignGet(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}

/** STORAGE_DRIVER=s3: the S3_* settings. */
export function s3FromEnv(): S3Storage {
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
export function r2FromEnv(): S3Storage {
  return new S3Storage({
    bucket: env.R2_BUCKET,
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
    checksumsWhenRequired: true,
  });
}
