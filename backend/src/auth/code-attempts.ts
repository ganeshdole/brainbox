import type { Adapter } from "@auth/core/adapters";

import type { Store } from "../store/index.ts";

/** Wrong codes allowed per email in one window. Five guesses at a 6-digit
 *  code succeed one time in 200,000. */
export const MAX_FAILED_CODES = 5;

/** How long the count of wrong codes lasts, from the first one. Matches how
 *  long a code lives, so a lockout outlasts every code sent before it. */
export const FAILED_CODES_WINDOW_MS = 15 * 60_000;

/**
 * The Auth.js adapter with guessing capped. Auth.js checks a sign-in code (or
 * link token) through `useVerificationToken` and puts no limit on attempts,
 * which is fine for a 64-character link token and not for a 6-digit code.
 *
 * - Each email gets MAX_FAILED_CODES wrong codes per window. Hitting the limit
 *   deletes every code pending for it, and until the window ends no code is
 *   accepted, not even a new one: sending a fresh code buys no extra guesses.
 * - Wrong codes are only counted for an email with a code pending, so guesses
 *   at addresses that never asked for one store nothing.
 * - A right code clears the count and any other pending codes.
 *
 * Counts live in the store, so the cap holds across server instances.
 */
export function withCodeAttemptLimit(adapter: Adapter, signIn: Store["signIn"]): Adapter {
  const { useVerificationToken } = adapter;
  if (!useVerificationToken) return adapter;
  return {
    ...adapter,
    async useVerificationToken(params) {
      const { identifier } = params;
      // Auth.js passes along whatever ?email= the callback URL carried, and
      // nothing at all when it is missing. A code is only unique per email,
      // so never look one up without it.
      if (!identifier) return null;

      const since = new Date(Date.now() - FAILED_CODES_WINDOW_MS);
      if ((await signIn.failedCodes(identifier, since)) >= MAX_FAILED_CODES) return null;

      const used = await useVerificationToken(params);
      if (used) {
        await signIn.revokeCodes(identifier);
        await signIn.forgetFailures(identifier);
        return used;
      }
      const failures = await signIn.recordFailedCode(identifier, since);
      if (failures >= MAX_FAILED_CODES) await signIn.revokeCodes(identifier);
      return null;
    },
  };
}
