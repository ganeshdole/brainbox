import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../env.ts";

// `base64url(payload).base64url(hmac)`, keyed on AUTH_SECRET.

export function sign(payload: string, secret = env.AUTH_SECRET): string {
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

export function verify(token: string, secret = env.AUTH_SECRET): string | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(mac(body, secret), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
