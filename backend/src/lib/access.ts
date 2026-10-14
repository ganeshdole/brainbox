import type { TeamRole } from "@ganeshdole/brainbox-shared";
import type { Context } from "hono";

import type { ProjectRecord, TeamRecord } from "../store/index.ts";
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
  const store = c.get("store");
  const [membership, team] = await Promise.all([store.teams.membership(teamId, uid), store.teams.get(teamId)]);
  if (!membership || !team) return c.json({ error: "Not found" }, 404);
  if (!atLeast(membership.role, min)) return c.json({ error: FORBIDDEN[min] }, 403);
  if (!(await teamHasAccess(store, team.id))) {
    return c.json({ error: "Subscription required", code: "subscription_required" }, 402);
  }
  return { uid, team, role: membership.role };
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
