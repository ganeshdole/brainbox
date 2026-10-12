import type { Adapter } from "@auth/core/adapters";

import type { Store } from "../store/index.ts";

/** Wrong codes allowed per email before every pending code for it stops
 *  working. Five guesses at a 6-digit code succeed one time in 200,000. */
export const MAX_FAILED_CODES = 5;

/**
 * The Auth.js adapter with guessing capped. Auth.js checks a sign-in code (or
 * link token) through `useVerificationToken` and puts no limit on attempts,
 * which is fine for a 64-character link token and not for a 6-digit code.
 *
 * - A wrong code is counted against the email. At MAX_FAILED_CODES, every code
 *   pending for it is deleted; the person requests a new one.
 * - Sending a new code clears the count, so someone who mistyped is not stuck.
 * - A right code clears the count and any other pending codes.
 *
 * Counts live in the store, so the cap holds across server instances.
 */
export function withCodeAttemptLimit(adapter: Adapter, signIn: Store["signIn"]): Adapter {
  const { createVerificationToken, useVerificationToken } = adapter;
  if (!createVerificationToken || !useVerificationToken) return adapter;
  return {
    ...adapter,
    async createVerificationToken(token) {
      await signIn.reset(token.identifier, { revokeCodes: false });
      return createVerificationToken(token);
    },
    async useVerificationToken(params) {
      // Auth.js passes along whatever ?email= the callback URL carried, and
      // nothing at all when it is missing. A code is only unique per email,
      // so never look one up without it.
      if (!params.identifier) return null;
      const used = await useVerificationToken(params);
      if (used) {
        await signIn.reset(params.identifier, { revokeCodes: true });
        return used;
      }
      const failures = await signIn.recordFailedCode(params.identifier);
      if (failures >= MAX_FAILED_CODES) await signIn.reset(params.identifier, { revokeCodes: true });
      return null;
    },
  };
}
