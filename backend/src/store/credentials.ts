// Integration credentials (Azure DevOps PATs, later Entra refresh tokens) at
// rest. Stores keep the sealed string as it is and never see the key: the
// backend seals before saving a connection and opens when it needs the token
// (integrations/azure-devops.ts). WebCrypto only: no node:crypto.
//
// Format: `v1.<iv>.<ciphertext+tag>`, base64url. AES-256-GCM, with the
// connection's identity (team, provider, external id) as additional data: a
// sealed value copied onto another connection does not open.

const VERSION = "v1";
const IV_BYTES = 12;

declare const sealed: unique symbol;

/** Credentials as stored: only `sealCredentials` makes one, so plaintext
 *  can't be saved by mistake. */
export type SealedCredentials = string & { readonly [sealed]: true };

/** A value read back from a database, checked to look sealed. */
export function asSealedCredentials(value: string): SealedCredentials {
  if (!value.startsWith(`${VERSION}.`)) throw new Error("stored credentials are not sealed");
  return value as SealedCredentials;
}

/** The additional data that ties sealed credentials to one connection. */
export function connectionContext(conn: { teamId: string; provider: string; externalId: string }): string {
  return `${conn.provider}:${conn.teamId}:${conn.externalId}`;
}

type AesKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const keys = new Map<string, Promise<AesKey>>();

/** A 32-byte key as base64 (`openssl rand -base64 32`). */
function importKey(base64Key: string): Promise<AesKey> {
  let key = keys.get(base64Key);
  if (!key) {
    const raw = fromBase64(base64Key);
    if (raw.length !== 32) {
      throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
    }
    key = crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    keys.set(base64Key, key);
  }
  return key;
}

/** True when `value` is a usable key, for checking env at boot. */
export function isEncryptionKey(value: string): boolean {
  try {
    return fromBase64(value).length === 32;
  } catch {
    return false;
  }
}

export async function sealCredentials(
  plain: string,
  opts: { key: string; context: string },
): Promise<SealedCredentials> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(opts.context) },
    await importKey(opts.key),
    utf8(plain),
  );
  return asSealedCredentials(`${VERSION}.${base64url(iv)}.${base64url(new Uint8Array(sealed))}`);
}

/** Throws when the value was sealed with another key or for another context. */
export async function openCredentials(
  sealed: SealedCredentials,
  opts: { key: string; context: string },
): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== VERSION || !iv || !data) throw new Error("unrecognised sealed credentials");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(iv), additionalData: utf8(opts.context) },
    await importKey(opts.key),
    fromBase64url(data),
  );
  return new TextDecoder().decode(plain);
}

function utf8(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(s));
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}
