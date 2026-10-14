import type { CreatedInvite } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";
import { z } from "zod";

import { getEmailer } from "../email/index.ts";
import { teamInviteEmail } from "../email/templates/team-invite.ts";
import { env } from "../env.ts";
import { teamAccess } from "../lib/access.ts";
import { toTeam, toTeamInvite, toTeamMember } from "../lib/serialize.ts";
import { INVITE_TTL_MS, inviteUrl, MAX_OPEN_INVITES, mayManage, normalizeEmail } from "../lib/teams.ts";
import type { MembershipChange } from "../store/index.ts";
import type { AppEnv } from "../types.ts";

const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });
const roleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "member"]).default("member"),
});

const LAST_OWNER = "A team needs at least one owner. Make someone else an owner first.";

function changed(result: MembershipChange) {
  if (result === "not_found") return { status: 404 as const, body: { error: "Not found" } };
  if (result === "last_owner") return { status: 409 as const, body: { error: LAST_OWNER } };
  return { status: 200 as const, body: { ok: true } };
}

export const teamsRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const teams = await c.get("store").teams.listForUser(uid);
    return c.json(teams.map((t) => toTeam(t, t.role)));
  })
  .patch("/:id", async (c) => {
    const parsed = renameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const access = await teamAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const team = await c.get("store").teams.rename(access.team.id, parsed.data.name);
    if (!team) return c.json({ error: "Not found" }, 404);
    return c.json(toTeam(team, access.role));
  })

  .get("/:id/members", async (c) => {
    const access = await teamAccess(c, c.req.param("id"), "member");
    if (access instanceof Response) return access;
    const members = await c.get("store").teams.members(access.team.id);
    return c.json(members.map(toTeamMember));
  })
  .patch("/:id/members/:userId", async (c) => {
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const access = await teamAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const store = c.get("store");
    const target = await store.teams.membership(access.team.id, c.req.param("userId"));
    if (!target) return c.json({ error: "Not found" }, 404);
    if (!mayManage(access.role, target.role, parsed.data.role)) {
      return c.json({ error: "Only the team's owners can change owners" }, 403);
    }
    const { status, body } = changed(await store.teams.setRole(access.team.id, target.userId, parsed.data.role));
    return c.json(body, status);
  })
  // Removes someone, or with your own id, leaves the Team.
  .delete("/:id/members/:userId", async (c) => {
    const userId = c.req.param("userId");
    const self = c.get("authUser").token?.sub === userId;
    const access = await teamAccess(c, c.req.param("id"), self ? "member" : "admin");
    if (access instanceof Response) return access;
    const store = c.get("store");
    if (!self) {
      const target = await store.teams.membership(access.team.id, userId);
      if (!target) return c.json({ error: "Not found" }, 404);
      if (!mayManage(access.role, target.role)) {
        return c.json({ error: "Only the team's owners can remove owners" }, 403);
      }
    }
    const { status, body } = changed(await store.teams.removeMember(access.team.id, userId));
    return c.json(body, status);
  })

  .get("/:id/invites", async (c) => {
    const access = await teamAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const invites = await c.get("store").teams.listInvites(access.team.id);
    return c.json(invites.map(toTeamInvite));
  })
  // Inviting an address again replaces its invite: a fresh link and expiry,
  // and the old link stops working. That is also how an invite is resent.
  .post("/:id/invites", async (c) => {
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid body", issues: parsed.error.issues }, 400);
    const access = await teamAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    const store = c.get("store");
    const email = normalizeEmail(parsed.data.email);

    const existing = await store.auth.adapter().getUserByEmail?.(email);
    if (existing && (await store.teams.membership(access.team.id, existing.id))) {
      return c.json({ error: `${email} is already in this team` }, 409);
    }
    // Expired invites are kept for the admins to see, but are not open.
    const now = new Date();
    const open = (await store.teams.listInvites(access.team.id)).filter((i) => i.expiresAt > now);
    if (open.length >= MAX_OPEN_INVITES && !open.some((i) => i.email === email)) {
      return c.json({ error: "This team has too many open invites. Revoke some first." }, 409);
    }

    const invite = await store.teams.createInvite({
      teamId: access.team.id,
      email,
      role: parsed.data.role,
      invitedBy: access.uid,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    // The console driver only logs, so nothing reaches the invitee: the
    // dashboard then offers the link to pass on by hand.
    let emailed = false;
    try {
      const token = c.get("authUser").token;
      await getEmailer().send({
        to: email,
        ...teamInviteEmail({
          teamName: access.team.name,
          inviter: token?.name?.trim() || token?.email || null,
          role: invite.role,
          url: inviteUrl(invite.id),
          email,
          expiresDays: INVITE_TTL_MS / (24 * 60 * 60 * 1000),
        }),
        ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
      });
      emailed = env.EMAIL_DRIVER === "resend";
    } catch (err) {
      console.error("[teams] sending an invite failed:", err);
    }
    const body: CreatedInvite = { invite: toTeamInvite(invite), emailed };
    return c.json(body, 201);
  })
  .delete("/:id/invites/:inviteId", async (c) => {
    const access = await teamAccess(c, c.req.param("id"), "admin");
    if (access instanceof Response) return access;
    await c.get("store").teams.revokeInvite(access.team.id, c.req.param("inviteId"));
    return c.json({ ok: true });
  });
