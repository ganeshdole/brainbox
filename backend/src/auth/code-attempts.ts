import type { Adapter } from "@auth/core/adapters";
import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";

import type { AuthStore } from "../store/index.ts";

/** Attempts allowed per email in any CODE_LIFETIME_MS. Five guesses at a
 *  6-digit code succeed one time in 200,000. */
export const MAX_CODE_ATTEMPTS = 5;

/** How long a sign-in code (or link) stays usable. The attempt limit counts
 *  over the same span, so no code can face more than MAX_CODE_ATTEMPTS. */
export const CODE_LIFETIME_MS = 15 * 60_000;

/**
 * The Auth.js adapter with guessing capped, when sign-in emails carry a code.
 * Auth.js checks a code (or link token) through `useVerificationToken` and puts
 * no limit on attempts, which is fine for a 64-character link token and not for
 * 6 digits. In link mode the adapter is returned as it is: a cap there would
 * only let anyone cancel someone else's link with five junk tokens.
 *
 * - Only the newest code works: sending one replaces those sent before, in
 *   one atomic step, so a guess is only ever against one code.
 * - Each email gets MAX_CODE_ATTEMPTS in any CODE_LIFETIME_MS (a sliding
 *   window). A code lives exactly that long, so it never faces more. An
 *   attempt takes its number from the store before the code is checked, in
 *   one atomic step, so parallel guesses cannot slip past the cap.
 * - The attempt that reaches the cap deletes the pending code, and further
 *   attempts are refused until earlier ones age out of the window; a fresh
 *   code buys no extra guesses.
 * - Attempts are only counted for an email with a code pending, so guesses at
 *   addresses that never asked for one store nothing.
 * - A right code clears the count.
 *
 * Counts live in the store, so the cap holds across server instances.
 */
export function withCodeAttemptLimit(
  adapter: Adapter,
  signIn: Pick<AuthStore, "recordAttempt" | "replaceCode" | "revokeCodes" | "forgetAttempts">,
  mode: EmailSignInMode,
): Adapter {
  const { useVerificationToken } = adapter;
  if (mode === "link" || !useVerificationToken) return adapter;
  return {
    ...adapter,
    async createVerificationToken(token) {
      await signIn.replaceCode(token);
      return token;
    },
    async useVerificationToken(params) {
      const { identifier } = params;
      // Auth.js passes along whatever ?email= the callback URL carried, and
      // nothing at all when it is missing. A code is only unique per email,
      // so never look one up without it.
      if (!identifier) return null;

      const at = new Date();
      const since = new Date(at.getTime() - CODE_LIFETIME_MS);
      const attempt = await signIn.recordAttempt(identifier, { at, since, keep: MAX_CODE_ATTEMPTS });
      // 0: no code pending, so there is nothing this attempt could match.
      if (attempt === 0 || attempt > MAX_CODE_ATTEMPTS) return null;

      const used = await useVerificationToken(params);
      if (used) {
        await signIn.forgetAttempts(identifier);
        return used;
      }
      if (attempt === MAX_CODE_ATTEMPTS) await signIn.revokeCodes(identifier);
      return null;
    },
  };
}
