import type { TeamRole } from "@ganeshdole/brainbox-shared";
import type { Context } from "hono";

import type { IssueRecord, ProjectRecord, TeamRecord } from "../store/types.ts";
import type { AppEnv } from "../types.ts";
import { teamHasAccess } from "./billing.ts";
import { atLeast } from "./teams.ts";

// Who may reach a Team's things. Every route that reads or changes a Team, or
// a project or connection it owns, asks here rather than comparing ids
// itself. Roles are read from the store on every request, never from the
// session, so removing someone takes effect at once.

export interface TeamAccess {
  uid: string;
  team: TeamRecord;
  role: TeamRole;
}

/**
 * The one Team of a deployment whose store has no teams module. Everyone who
 * can sign in owns it and so sees every project, which is why createApp then
 * insists on `auth.allowedEmailDomains`.
 */
export const EVERYONE_TEAM: TeamRecord = { id: "everyone", name: "Everyone", createdAt: new Date(0) };

const FORBIDDEN: Record<TeamRole, string> = {
  member: "Only members of this team can do that",
  admin: "Only team admins can do that",
  owner: "Only the team's owners can do that",
};

/**
 * The caller's access to a Team, needing at least `min`. Otherwise the
 * response to send: 404 to someone outside the Team (nothing is revealed),
 * 403 to a member without the role, 402 when the Team's plan has lapsed.
 */
export async function teamAccess(
  c: Context<AppEnv>,
  teamId: string,
  min: TeamRole,
): Promise<TeamAccess | Response> {
  const uid = c.get("authUser").token?.sub;
  if (!uid) return c.json({ error: "Unauthorized" }, 401);
  const { teams } = c.get("store");
  if (!teams) {
    if (teamId !== EVERYONE_TEAM.id) return c.json({ error: "Not found" }, 404);
    return { uid, team: EVERYONE_TEAM, role: "owner" };
  }
  const [membership, team] = await Promise.all([teams.membership(teamId, uid), teams.get(teamId)]);
  if (!membership || !team) return c.json({ error: "Not found" }, 404);
  if (!atLeast(membership.role, min)) return c.json({ error: FORBIDDEN[min] }, 403);
  if (!(await teamHasAccess(c.get("deps"), team.id))) {
    return c.json({ error: "Subscription required", code: "subscription_required" }, 402);
  }
  return { uid, team, role: membership.role };
}

/** The Teams the user is in, with their role: just the implicit one when the
 *  store has no teams module. */
export async function teamsOf(c: Context<AppEnv>, uid: string): Promise<Array<TeamRecord & { role: TeamRole }>> {
  const { teams } = c.get("store");
  return teams ? teams.listForUser(uid) : [{ ...EVERYONE_TEAM, role: "owner" }];
}

/** The caller's access to a project, through its Team. */
export async function projectAccess(
  c: Context<AppEnv>,
  projectId: string,
  min: TeamRole,
): Promise<(TeamAccess & { project: ProjectRecord }) | Response> {
  const project = await c.get("store").projects.get(projectId);
  if (!project) return c.json({ error: "Not found" }, 404);
  const access = await teamAccess(c, project.teamId, min);
  return access instanceof Response ? access : { ...access, project };
}

/**
 * The issue and its caller, when the caller may work on it; otherwise the
 * response to send. Access is the issue's project's, through its Team: every
 * member may read and triage (404 outside the Team, the same as no issue;
 * 402 when the Team's plan has lapsed). The one place issue access is decided.
 */
export async function issueAccess(
  c: Context<AppEnv>,
  id: string,
): Promise<{ uid: string; issue: IssueRecord } | Response> {
  const issue = await c.get("store").issues.get(id);
  if (!issue) return c.json({ error: "Not found" }, 404);
  const access = await projectAccess(c, issue.projectId, "member");
  return access instanceof Response ? access : { uid: access.uid, issue };
}
