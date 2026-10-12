import { API_URL } from "./authConfig";

/** What a sign-in email carries, as the backend's AUTH_EMAIL_MODE sets it. */
export type EmailSignInMode = "link" | "code" | "both";

const MODES: readonly EmailSignInMode[] = ["link", "code", "both"];

/** Remembers which address a code was sent to while the code round-trips
 *  through the API, so a wrong code brings the person back to the code step. */
export const PENDING_EMAIL_KEY = "brainbox:pendingSignInEmail";

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

/** How this deployment signs in by email. Falls back to "link", which is what
 *  a backend that predates the setting does. */
export async function fetchEmailSignInMode(): Promise<EmailSignInMode> {
  try {
    const res = await fetch(`${API_URL}/api/sign-in-options`);
    if (!res.ok) return "link";
    const body: unknown = await res.json();
    return isMode(body) ? body.email : "link";
  } catch {
    return "link";
  }
}

function isMode(body: unknown): body is { email: EmailSignInMode } {
  if (typeof body !== "object" || body === null || !("email" in body)) return false;
  return MODES.some((mode) => mode === body.email);
}
