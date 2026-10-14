import type { ResolvedOptions } from "../deps.ts";
import { sign, verify } from "./signed.ts";

// A file URL with no cookie and no expiry, for embedding in external tickets.

export function publicFileUrl(options: Pick<ResolvedOptions, "publicUrl" | "secret">, key: string): string {
  return `${options.publicUrl}/f/${sign(key, options.secret)}`;
}

export function fileKeyFromToken(token: string, secret: string): string | null {
  const key = verify(token, secret);
  if (!key || key.startsWith("/") || key.split("/").includes("..")) return null;
  return key;
}
