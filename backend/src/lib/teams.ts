import type { TeamRole } from "@ganeshdole/brainbox-shared";

import { env } from "../env.ts";

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

/**
 * Whether `actor` may change a member who holds `target`, to `next` when
 * given (a removal otherwise). Owners may do anything; Admins manage Admins
 * and Members but neither touch Owners nor make them. The dashboard mirrors
 * this in lib/team.ts to decide which controls to show.
 */
export function mayManage(actor: TeamRole, target: TeamRole, next?: TeamRole): boolean {
  if (actor === "owner") return true;
  if (actor !== "admin") return false;
  return target !== "owner" && next !== "owner";
}

/** The name of the Team a first project creates. */
export function defaultTeamName(name: string | null | undefined, email: string | null | undefined): string {
  const who = name?.trim() || email?.trim();
  return who ? `${who}'s team` : "My team";
}

/** The dashboard page that accepts an invite. */
export function inviteUrl(inviteId: string): string {
  return `${env.DASHBOARD_ORIGIN}/invite/${inviteId}`;
}

/** Addresses compare the way Auth.js stores them. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
