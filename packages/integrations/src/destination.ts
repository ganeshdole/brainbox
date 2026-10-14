import type { Ticket } from "./ticket.ts";

/** Where a ticket goes. One implementation per external tool. */
export interface Destination {
  readonly kind: string;
  deliver(ticket: Ticket): Promise<DeliveryResult>;
}

/** Errors are data, not throws. `status` is the upstream HTTP status, if any. */
export type DeliveryResult =
  | { ok: true; externalId: string; url: string }
  | { ok: false; status?: number; error: string };

/** A credential, or a function called at send time (for short-lived tokens). */
export type TokenSource = string | (() => Promise<string> | string);

export async function resolveToken(source: TokenSource): Promise<string> {
  const token = typeof source === "function" ? await source() : source;
  if (!token) throw new Error("empty token");
  return token;
}

export type FetchLike = typeof fetch;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
