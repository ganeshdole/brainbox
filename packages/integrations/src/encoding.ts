export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(s));
}

export function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? utf8(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function pemToDer(pem: string, label: string): Uint8Array<ArrayBuffer> {
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!match) throw new Error(`Expected a PEM "${label}" block`);
  const [, found, body] = match;
  if (found !== label) {
    throw new Error(
      `Expected a PEM "${label}" block, got "${found}". ` +
        `Convert with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem`,
    );
  }
  return fromBase64((body ?? "").replace(/\s+/g, ""));
}

export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}
