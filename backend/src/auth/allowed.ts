import { normalizeEmail } from "../lib/teams.ts";
import type { Store } from "../store/index.ts";

/**
 * Whether this address may sign in, under AUTH_ALLOWED_EMAIL_DOMAINS. With no
 * domains listed everyone may. Otherwise an address on a listed domain may,
 * and so may anyone a Team has let in from elsewhere: someone with an open
 * invite, or already a member of a Team. Removing such a person from every
 * Team stops their next sign-in.
 */
export async function signInAllowed(
  store: Store,
  email: string | null | undefined,
  domains: readonly string[],
): Promise<boolean> {
  if (domains.length === 0) return true;
  if (!email) return false;
  const address = normalizeEmail(email);
  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (domains.includes(domain)) return true;

  const now = new Date();
  if ((await store.teams.invitesForEmail(address)).some((i) => i.expiresAt > now)) return true;
  const user = await store.authAdapter().getUserByEmail?.(address);
  return !!user && (await store.teams.listForUser(user.id)).length > 0;
}
