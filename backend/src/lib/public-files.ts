import { env } from "../env.ts";
import { sign, verify } from "./signed.ts";

// A file URL with no cookie and no expiry, for embedding in external tickets.

export function publicFileUrl(key: string): string {
  return `${env.PUBLIC_API_URL}/f/${sign(key)}`;
}

export function fileKeyFromToken(token: string): string | null {
  const key = verify(token);
  if (!key || key.startsWith("/") || key.split("/").includes("..")) return null;
  return key;
}
