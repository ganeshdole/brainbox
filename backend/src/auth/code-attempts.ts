import type { Adapter } from "@auth/core/adapters";
import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";

import type { Store } from "../store/index.ts";

/** Attempts allowed per email in one window. Five guesses at a 6-digit code
 *  succeed one time in 200,000. */
export const MAX_CODE_ATTEMPTS = 5;

/** How long the count of attempts lasts, from the first one. Matches how long
 *  a code lives, so a lockout outlasts every code sent before it. */
export const CODE_ATTEMPTS_WINDOW_MS = 15 * 60_000;

/**
 * The Auth.js adapter with guessing capped, when sign-in emails carry a code.
 * Auth.js checks a code (or link token) through `useVerificationToken` and puts
 * no limit on attempts, which is fine for a 64-character link token and not for
 * 6 digits. In link mode the adapter is returned as it is: a cap there would
 * only let anyone cancel someone else's link with five junk tokens.
 *
 * - Each email gets MAX_CODE_ATTEMPTS per window. An attempt takes its number
 *   from the store before the code is checked, in one atomic step, so a burst
 *   of parallel guesses cannot slip past the cap.
 * - The attempt that reaches the cap deletes every code pending for the email,
 *   and until the window ends no code is accepted, not even a new one: sending
 *   a fresh code buys no extra guesses.
 * - Attempts are only counted for an email with a code pending, so guesses at
 *   addresses that never asked for one store nothing.
 * - A right code clears the count and any other pending codes.
 *
 * Counts live in the store, so the cap holds across server instances.
 */
export function withCodeAttemptLimit(
  adapter: Adapter,
  signIn: Store["signIn"],
  mode: EmailSignInMode,
): Adapter {
  const { useVerificationToken } = adapter;
  if (mode === "link" || !useVerificationToken) return adapter;
  return {
    ...adapter,
    async useVerificationToken(params) {
      const { identifier } = params;
      // Auth.js passes along whatever ?email= the callback URL carried, and
      // nothing at all when it is missing. A code is only unique per email,
      // so never look one up without it.
      if (!identifier) return null;

      const since = new Date(Date.now() - CODE_ATTEMPTS_WINDOW_MS);
      const attempt = await signIn.recordAttempt(identifier, since);
      // 0: no code pending, so there is nothing this attempt could match.
      if (attempt === 0 || attempt > MAX_CODE_ATTEMPTS) return null;

      const used = await useVerificationToken(params);
      if (used) {
        await signIn.revokeCodes(identifier);
        await signIn.forgetAttempts(identifier);
        return used;
      }
      if (attempt === MAX_CODE_ATTEMPTS) await signIn.revokeCodes(identifier);
      return null;
    },
  };
}
