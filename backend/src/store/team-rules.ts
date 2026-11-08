import type { TeamRole } from "@ganeshdole/brainbox-shared";

// Rules every store applies to Team memberships, inside the same atomic step
// as the change itself, so two Owners demoting each other at once cannot both
// succeed, and an Admin demoted a moment ago cannot still change an Owner.

/** True when moving a member from `current` to `next` (null: removing them)
 *  would leave the Team without an Owner. `owners` counts them before. */
export function leavesNoOwner(owners: number, current: TeamRole, next: TeamRole | null): boolean {
  return current === "owner" && next !== "owner" && owners <= 1;
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
