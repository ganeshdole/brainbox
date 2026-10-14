import type { TeamRole } from "@ganeshdole/brainbox-shared";

// Rules every store applies to Team memberships, inside the same atomic step
// as the change itself, so two Owners demoting each other at once cannot both
// succeed.

/** True when moving a member from `current` to `next` (null: removing them)
 *  would leave the Team without an Owner. `owners` counts them before. */
export function leavesNoOwner(owners: number, current: TeamRole, next: TeamRole | null): boolean {
  return current === "owner" && next !== "owner" && owners <= 1;
}
