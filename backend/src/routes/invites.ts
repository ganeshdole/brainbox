import type { ReceivedInvite } from "@ganeshdole/brainbox-shared";
import type { Context } from "hono";
import { Hono } from "hono";

import { normalizeEmail } from "../lib/teams.ts";
import type { TeamInviteRecord } from "../store/index.ts";
import type { AppEnv } from "../types.ts";

// The invited person's side. Session-only, outside the paywall: someone
// joining a paying Team has no plan of their own, and joining is how they
// come to be covered by one.
//
// An invite is accepted only by the address it was sent to, which Auth.js has
// verified (a magic link or code reached it, or Google vouched for it). The
// link is how they find it, not what lets them in, so a forwarded link is no
// use to anyone else.

/** The signed-in address, as invites store them. */
function callerEmail(c: Context<AppEnv>): string | null {
  const email = c.get("authUser").token?.email;
  return email ? normalizeEmail(email) : null;
}

async function received(c: Context<AppEnv>, invite: TeamInviteRecord): Promise<ReceivedInvite | null> {
  const store = c.get("store");
  const team = await store.teams.get(invite.teamId);
  if (!team) return null;
  const inviter = invite.invitedBy ? await store.authAdapter().getUser?.(invite.invitedBy) : null;
  return {
    id: invite.id,
    teamId: team.id,
    teamName: team.name,
    invitedBy: inviter ? inviter.name?.trim() || inviter.email : null,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export const invitesRoute = new Hono<AppEnv>()
  // Open invites sent to the caller's address, for the dashboard to offer
  // even to someone who signed in without the link.
  .get("/", async (c) => {
    const email = callerEmail(c);
    if (!email) return c.json([]);
    const now = new Date();
    const open = (await c.get("store").teams.invitesForEmail(email)).filter((i) => i.expiresAt > now);
    const list = await Promise.all(open.map((i) => received(c, i)));
    return c.json(list.filter((i) => i !== null));
  })
  .get("/:id", async (c) => {
    const invite = await c.get("store").teams.getInvite(c.req.param("id"));
    if (!invite) return c.json({ error: "This invite was used, revoked or replaced" }, 404);
    if (invite.email !== callerEmail(c)) {
      return c.json({ error: "This invite is for another address", code: "wrong_account", email: invite.email }, 403);
    }
    const body = await received(c, invite);
    if (!body) return c.json({ error: "This invite was used, revoked or replaced" }, 404);
    return c.json(body);
  })
  .post("/:id/accept", async (c) => {
    const uid = c.get("authUser").token?.sub;
    if (!uid) return c.json({ error: "Unauthorized" }, 401);
    const store = c.get("store");
    const invite = await store.teams.getInvite(c.req.param("id"));
    if (!invite) return c.json({ error: "This invite was used, revoked or replaced" }, 404);
    if (invite.email !== callerEmail(c)) {
      return c.json({ error: "This invite is for another address", code: "wrong_account", email: invite.email }, 403);
    }
    const result = await store.teams.acceptInvite(invite.id, uid, new Date());
    if (result.status === "not_found") return c.json({ error: "This invite was used, revoked or replaced" }, 404);
    if (result.status === "expired") return c.json({ error: "This invite has expired. Ask for a new one." }, 410);
    return c.json({ teamId: result.teamId });
  });
