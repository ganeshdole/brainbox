import type { ProjectKey } from "@brainbox-sh/shared";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A public project key: `pk_` + 24 base62 chars. */
export function generateProjectKey(): ProjectKey {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 62];
  return `pk_${out}`;
}
