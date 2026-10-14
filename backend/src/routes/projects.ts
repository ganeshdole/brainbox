import type { ProjectTeam } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";
import { z } from "zod";

import { EVERYONE_TEAM, projectAccess, teamAccess, teamsOf, type TeamAccess } from "../lib/access.ts";
import { teamHasAccess, userHasAccess } from "../lib/billing.ts";
import { generateProjectKey } from "../lib/projectKey.ts";
import { toIssue, toProject } from "../lib/serialize.ts";
import { defaultTeamName } from "../lib/teams.ts";
import type { AppEnv } from "../types.ts";

// An origin as browsers send it: scheme + host (+ optional port), no path.
const origin = z
  .string()
  .max(300)
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, "must be an origin like https://app.example.com");

const createSchema = z.object({
  name: z.string().min(1).max(100),
  teamId: z.string().min(1).optional(),
  allowedOrigins: z.array(origin).max(20).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    allowedOrigins: z.array(origin).max(20).optional(),
  })
  .refine((b) => b.name !== undefined || b.allowedOrigins !== undefined, {
    message: "nothing to update",
  });

export const projectsRoute = new Hono<AppEnv>()
  // Every project in every Team the caller belongs to, leaving out Teams
  // whose plan has lapsed: opening one would only meet the paywall.
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const deps = c.get("deps");
    const teams = [];
    for (const team of await teamsOf(c, uid)) {
      if (await teamHasAccess(deps, team.id)) teams.push(team);
    }
    const byId = new Map(teams.map((t) => [t.id, t]));
    const rows = await deps.store.projects.listForTeams(teams.map((t) => t.id));
    return c.json(
      rows.flatMap((r) => {
        const team = byId.get(r.teamId);
        if (!team) return [];
        const project = toProject(r, { id: team.id, name: team.name, role: team.role });
        return [{ ...project, issueCount: r.issueCount, featureRequestCount: r.featureRequestCount }];
      }),
    );
  })
  // Into `teamId` when given. Without it, into the Team the caller owns, or a
  // new one for them when they own none: their first project is how an
  // Account comes to have a Team. Without the teams module, into the one
  // implicit Team.
  .post("/", async (c) => {
    const token = c.get("authUser").token;
    const uid = token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const deps = c.get("deps");
    const { store } = deps;
    const teamId =
      parsed.data.teamId ??
      (store.teams ? (await store.teams.listForUser(uid)).find((t) => t.role === "owner")?.id : EVERYONE_TEAM.id);
    let team: ProjectTeam;
    if (teamId || !store.teams) {
      const access = await teamAccess(c, teamId ?? EVERYONE_TEAM.id, "admin");
      if (access instanceof Response) return access;
      team = { id: access.team.id, name: access.team.name, role: access.role };
    } else {
      // Paid for by the caller's own plan, not by a Team they are only in.
      if (!(await userHasAccess(deps, uid, token?.email))) {
        return c.json({ error: "Subscription required", code: "subscription_required" }, 402);
      }
      const created = await store.teams.create({
        name: defaultTeamName(token?.name, token?.email),
        ownerId: uid,
      });
      team = { id: created.id, name: created.name, role: "owner" };
    }
    const row = await store.projects.create({
      teamId: team.id,
      name: parsed.data.name,
      key: generateProjectKey(),
      allowedOrigins: parsed.data.allowedOrigins ?? [],
    });
    return c.json(toProject(row, team), 201);
  })
  .patch("/:id", async (c) => {
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    }
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const row = await c.get("store").projects.update(access.project.id, parsed.data);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(toProject(row, teamOf(access)));
  })
  .get("/:id", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    return c.json(toProject(access.project, teamOf(access)));
  })
  .delete("/:id", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    // Issues go with it, and what the store's modules keep for them; stored
    // media is orphaned for now (the Storage
    // interface has no delete yet).
    await c.get("store").projects.delete(access.project.id);
    return c.json({ ok: true });
  })
  .get("/:id/issues", async (c) => {
    const access = await projectAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    const { store, storage } = c.get("deps");
    const rows = await store.issues.listForProject(access.project.id);
    return c.json(await Promise.all(rows.map((r) => toIssue(r, storage))));
  });

function teamOf({ team, role }: TeamAccess): ProjectTeam {
  return { id: team.id, name: team.name, role };
}
