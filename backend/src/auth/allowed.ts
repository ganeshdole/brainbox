import { normalizeEmail } from "../lib/teams.ts";
import type { AuthStore, TeamStore } from "../store/types.ts";

/**
 * Whether this address may sign in, under AUTH_ALLOWED_EMAIL_DOMAINS. With no
 * domains listed everyone may. Otherwise an address on a listed domain may,
 * and so may anyone a Team has let in from elsewhere: someone with an open
 * invite, or already a member of a Team. Removing such a person from every
 * Team stops their next sign-in. Without the teams module, only the domains.
 */
export async function signInAllowed(
  auth: AuthStore,
  teams: TeamStore | undefined,
  email: string | null | undefined,
  domains: readonly string[],
): Promise<boolean> {
  if (domains.length === 0) return true;
  if (!email) return false;
  const address = normalizeEmail(email);
  const domain = address.slice(address.lastIndexOf("@") + 1);
  if (domains.includes(domain)) return true;

  if (!teams) return false;
  const now = new Date();
  if ((await teams.invitesForEmail(address)).some((i) => i.expiresAt > now)) return true;
  const user = await auth.adapter().getUserByEmail?.(address);
  return !!user && (await teams.listForUser(user.id)).length > 0;
}
