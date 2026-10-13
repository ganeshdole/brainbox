import type { Project, TeamRole } from "@ganeshdole/brainbox-shared";

// What the dashboard shows each role. The API enforces the same rules
// (backend/src/lib/teams.ts); these only decide which controls to offer.

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const ROLE_HINTS: Record<TeamRole, string> = {
  owner: "Everything, including other owners",
  admin: "Projects, integrations and members",
  member: "Reads reports and resends them",
};

/** Admins and Owners manage projects, integrations and people. */
export function canAdmin(role: TeamRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether `actor` may change someone who is `target`, to `next` when given (a
 * removal otherwise). Owners may do anything; Admins manage Admins and Members
 * but neither touch Owners nor make them.
 */
export function mayManage(actor: TeamRole, target: TeamRole, next?: TeamRole): boolean {
  if (actor === "owner") return true;
  if (actor !== "admin") return false;
  return target !== "owner" && next !== "owner";
}

/** The roles `actor` may give someone who is `target` now. */
export function assignableRoles(actor: TeamRole, target: TeamRole): TeamRole[] {
  return (["owner", "admin", "member"] as const).filter((next) => mayManage(actor, target, next));
}

/** True once an invite can no longer be accepted. */
export function inviteExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}

/** Projects grouped by Team, in the order their Teams first appear. A single
 *  group means the switcher needs no headings. */
export function groupByTeam(projects: Project[]): Array<{ team: Project["team"]; projects: Project[] }> {
  const groups = new Map<string, { team: Project["team"]; projects: Project[] }>();
  for (const project of projects) {
    const group = groups.get(project.team.id) ?? { team: project.team, projects: [] };
    group.projects.push(project);
    groups.set(project.team.id, group);
  }
  return [...groups.values()];
}

/**
 * Which Team a new project should go into from here: the current project's
 * Team when the caller can add to it, else the first Team they administer.
 * Undefined lets the API pick, which makes the caller a Team of their own.
 */
export function newProjectTeam(current: Project | null, projects: Project[]): string | undefined {
  if (current && canAdmin(current.team.role)) return current.team.id;
  return projects.find((p) => canAdmin(p.team.role))?.team.id;
}
