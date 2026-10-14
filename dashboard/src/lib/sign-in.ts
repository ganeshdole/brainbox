import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";

import { api } from "./api";
import { API_URL } from "./authConfig";

const MODES: readonly EmailSignInMode[] = ["link", "code", "both"];

/** Remembers a code sign-in while the code round-trips through the API, so a
 *  wrong code brings the person back to the code step, still headed where
 *  they were going. */
const PENDING_SIGN_IN_KEY = "brainbox:pendingSignIn";

/** A code sign-in in flight: who it is for, and where it lands. */
export interface PendingSignIn {
  email: string;
  callbackUrl: string;
}

/**
 * The address the way Auth.js stores it. Its code check compares the ?email=
 * we send with the stored address exactly, so this must match the backend's
 * normalising (trimmed, lower-cased) or a correct code is refused.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True for a complete code: six digits. */
export function isSignInCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/**
 * Where to send the browser to sign in with a code. It is the same callback a
 * sign-in link opens, so Auth.js sets the session cookie and redirects on to
 * `callbackUrl`, or to /login?error=Verification when the code is wrong.
 */
export function codeSignInUrl(email: string, code: string, callbackUrl: string): string {
  const query = new URLSearchParams({ email: normalizeEmail(email), token: code, callbackUrl });
  return `${API_URL}/api/auth/callback/magic-link?${query}`;
}

/** How this deployment signs people in: what a sign-in email carries, and
 *  whether Google is offered. Falls back to what a backend that predates the
 *  settings does: links, and Google. */
export async function fetchSignInOptions(): Promise<{ email: EmailSignInMode; google: boolean }> {
  try {
    const { email, google } = await api.getSignInOptions();
    return { email: MODES.find((mode) => mode === email) ?? "link", google: google !== false };
  } catch {
    return { email: "link", google: true };
  }
}

/** Stores the sign-in about to leave for the API. Without storage a wrong
 *  code just starts over from the email step. */
export function savePendingSignIn(pending: PendingSignIn): void {
  try {
    sessionStorage.setItem(PENDING_SIGN_IN_KEY, JSON.stringify(pending));
  } catch {
    // Private mode / storage disabled.
  }
}

/** The sign-in this tab sent off, if any. Read once: the next code submitted
 *  stores it again. */
export function takePendingSignIn(): PendingSignIn | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGN_IN_KEY);
    sessionStorage.removeItem(PENDING_SIGN_IN_KEY);
    const pending: unknown = raw ? JSON.parse(raw) : null;
    return isPendingSignIn(pending) ? pending : null;
  } catch {
    return null;
  }
}

function isPendingSignIn(value: unknown): value is PendingSignIn {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string" &&
    "callbackUrl" in value &&
    typeof value.callbackUrl === "string"
  );
}
