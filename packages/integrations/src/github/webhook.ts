import { fromHex, utf8 } from "../encoding.ts";

/** Checks `X-Hub-Signature-256` against the raw body. Never throws. */
export async function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const hex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, fromHex(hex), utf8(rawBody));
}
