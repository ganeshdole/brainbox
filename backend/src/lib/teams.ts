import type { TeamRole } from "@ganeshdole/brainbox-shared";

/** How long an invite can be accepted for. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Open invites one Team may have at once, so the invite route cannot be used
 *  to mail any number of addresses. */
export const MAX_OPEN_INVITES = 100;

const RANK: Record<TeamRole, number> = { member: 0, admin: 1, owner: 2 };

/** True when `role` can do what `min` can. */
export function atLeast(role: TeamRole, min: TeamRole): boolean {
  return RANK[role] >= RANK[min];
}

// Checked again by the store, with both roles as they are at the change.
export { mayManage } from "../store/team-rules.ts";

/** The name of the Team a first project creates. */
export function defaultTeamName(name: string | null | undefined, email: string | null | undefined): string {
  const who = name?.trim() || email?.trim();
  return who ? `${who}'s team` : "My team";
}

/** The dashboard page that accepts an invite. */
export function inviteUrl(dashboardOrigin: string, inviteId: string): string {
  return `${dashboardOrigin}/invite/${inviteId}`;
}

/** Addresses compare the way Auth.js stores them. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
