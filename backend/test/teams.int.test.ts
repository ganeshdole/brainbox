import type { CreatedInvite, Project, ReceivedInvite, Team, TeamInvite, TeamMember } from "@ganeshdole/brainbox-shared";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { signInAllowed } from "../src/auth/allowed.ts";
import { getStore } from "../src/store/index.ts";
import {
  addMember,
  authCookie,
  makeIssue,
  makeTeam,
  makeTeamProject,
  makeUser,
  teamOf,
} from "./helpers.ts";

/** A signed-in request as `user`. */
async function as(user: { id: string; email: string }, path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { cookie: await authCookie(user.id, user.email), "content-type": "application/json", ...init.headers },
  });
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

/** An owner with a Team and a project in it, plus an admin and a member. */
async function team() {
  const owner = await makeUser();
  const admin = await makeUser();
  const member = await makeUser();
  const teamId = await teamOf(owner.id);
  await addMember(teamId, admin.id, "admin");
  await addMember(teamId, member.id, "member");
  const project = await makeTeamProject(teamId);
  return { owner, admin, member, teamId, project };
}

describe("members reach the Team's projects", () => {
  it("lists the Team's projects with the Team and the caller's role", async () => {
    const { member, teamId, project } = await team();
    const res = await as(member, "/api/projects");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Project[];
    expect(rows.map((p) => p.id)).toEqual([project.id]);
    expect(rows[0]!.team).toEqual({ id: teamId, name: "Test Team", role: "member" });
  });

  it("lets a member read the project, its reports and their files, and resend them", async () => {
    const { member, project } = await team();
    const issue = await makeIssue(project.id);
    expect((await as(member, `/api/projects/${project.id}`)).status).toBe(200);
    expect((await as(member, `/api/projects/${project.id}/issues`)).status).toBe(200);
    expect((await as(member, `/api/issues/${issue.id}`)).status).toBe(200);
    expect((await as(member, `/api/projects/${project.id}/destinations`)).status).toBe(200);
    // No destination yet: the request is allowed and answers as the owner's would.
    expect((await as(member, `/api/issues/${issue.id}/deliveries`, { method: "POST" })).status).toBe(409);
  });

  it("keeps settings, destinations and deletion to admins", async () => {
    const { admin, member, project } = await team();
    const rename = { method: "PATCH", ...json({ name: "Renamed" }) };
    expect((await as(member, `/api/projects/${project.id}`, rename)).status).toBe(403);
    expect((await as(admin, `/api/projects/${project.id}`, rename)).status).toBe(200);

    const install = { method: "POST", ...json({ projectId: project.id }) };
    expect((await as(member, "/api/integrations/github/install", install)).status).toBe(403);
    expect((await as(admin, "/api/integrations/github/install", install)).status).toBe(200);

    const unset = { method: "DELETE" };
    expect((await as(member, `/api/projects/${project.id}/destinations/github`, unset)).status).toBe(403);
    expect((await as(member, `/api/projects/${project.id}`, unset)).status).toBe(403);
    expect((await as(admin, `/api/projects/${project.id}`, unset)).status).toBe(200);
  });

  it("404s everyone outside the Team, and stops a removed member at once", async () => {
    const { owner, member, teamId, project } = await team();
    const stranger = await makeUser();
    expect((await as(stranger, `/api/projects/${project.id}`)).status).toBe(404);
    expect((await as(stranger, `/api/teams/${teamId}/members`)).status).toBe(404);

    const removed = await as(owner, `/api/teams/${teamId}/members/${member.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect((await as(member, `/api/projects/${project.id}`)).status).toBe(404);
    expect((await (await as(member, "/api/projects")).json()) as Project[]).toEqual([]);
  });
});

describe("POST /api/projects and Teams", () => {
  it("makes a first project's Team, named after its owner", async () => {
    const me = await makeUser();
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: { cookie: await authCookie(me.id, me.email), "content-type": "application/json" },
      body: JSON.stringify({ name: "First" }),
    });
    expect(res.status).toBe(201);
    const project = (await res.json()) as Project;
    expect(project.team.role).toBe("owner");
    expect(project.team.name).toBe("Test User's team");

    // The next one goes into the same Team.
    const next = (await (await as(me, "/api/projects", { method: "POST", ...json({ name: "Second" }) })).json()) as Project;
    expect(next.team.id).toBe(project.team.id);
  });

  it("creates into a named Team for its admins only", async () => {
    const { admin, member, teamId } = await team();
    const body = { method: "POST", ...json({ name: "Shared", teamId }) };
    expect((await as(member, "/api/projects", body)).status).toBe(403);
    const res = await as(admin, "/api/projects", body);
    expect(res.status).toBe(201);
    expect(((await res.json()) as Project).team.id).toBe(teamId);
  });
});

describe("invites", () => {
  it("invites by email, offers the link, and lets the invited address join", async () => {
    const { admin, teamId, project } = await team();
    const res = await as(admin, `/api/teams/${teamId}/invites`, {
      method: "POST",
      ...json({ email: "  New.Person@Example.com ", role: "member" }),
    });
    expect(res.status).toBe(201);
    const { invite, emailed } = (await res.json()) as CreatedInvite;
    // The test deployment only logs email, so the link is to be passed on.
    expect(emailed).toBe(false);
    expect(invite.email).toBe("new.person@example.com");
    expect(invite.url).toMatch(new RegExp(`/invite/${invite.id}$`));

    const listed = (await (await as(admin, `/api/teams/${teamId}/invites`)).json()) as TeamInvite[];
    expect(listed.map((i) => i.id)).toEqual([invite.id]);

    // No plan of their own: the invite routes sit outside the paywall.
    const invitee = await makeUser("new.person@example.com", { subscribed: false });
    const mine = (await (await as(invitee, "/api/invites")).json()) as ReceivedInvite[];
    expect(mine).toMatchObject([{ id: invite.id, teamId, teamName: "Test Team", role: "member" }]);
    expect((await as(invitee, `/api/invites/${invite.id}`)).status).toBe(200);

    const accepted = await as(invitee, `/api/invites/${invite.id}/accept`, { method: "POST" });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ teamId });

    // In, on the Team's plan.
    expect((await as(invitee, `/api/projects/${project.id}`)).status).toBe(200);
    // Used up.
    expect((await as(invitee, `/api/invites/${invite.id}/accept`, { method: "POST" })).status).toBe(404);
    expect((await (await as(admin, `/api/teams/${teamId}/invites`)).json()) as TeamInvite[]).toEqual([]);
  });

  it("is accepted only by the address it was sent to", async () => {
    const { admin, teamId } = await team();
    const { invite } = (await (
      await as(admin, `/api/teams/${teamId}/invites`, { method: "POST", ...json({ email: "sam@example.com" }) })
    ).json()) as CreatedInvite;

    const someoneElse = await makeUser("mallory@example.com");
    const peek = await as(someoneElse, `/api/invites/${invite.id}`);
    expect(peek.status).toBe(403);
    expect(await peek.json()).toMatchObject({ code: "wrong_account", email: "sam@example.com" });
    expect((await as(someoneElse, `/api/invites/${invite.id}/accept`, { method: "POST" })).status).toBe(403);
    expect(await getStore().teams.membership(teamId, someoneElse.id)).toBeNull();
  });

  it("refuses an expired invite, a revoked one and one replaced by a new invite", async () => {
    const { admin, teamId } = await team();
    const invitee = await makeUser("late@example.com");
    const store = getStore();

    const expired = await store.teams.createInvite({
      teamId,
      email: "late@example.com",
      role: "member",
      invitedBy: admin.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await as(invitee, `/api/invites/${expired.id}/accept`, { method: "POST" })).status).toBe(410);
    expect((await (await as(invitee, "/api/invites")).json()) as ReceivedInvite[]).toEqual([]);

    // Inviting again replaces it: the old link no longer works.
    const fresh = ((await (
      await as(admin, `/api/teams/${teamId}/invites`, { method: "POST", ...json({ email: "late@example.com" }) })
    ).json()) as CreatedInvite).invite;
    expect(fresh.id).not.toBe(expired.id);
    expect((await as(invitee, `/api/invites/${expired.id}`)).status).toBe(404);

    expect((await as(admin, `/api/teams/${teamId}/invites/${fresh.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await as(invitee, `/api/invites/${fresh.id}/accept`, { method: "POST" })).status).toBe(404);
  });

  it("keeps inviting to admins, and refuses someone already in", async () => {
    const { member, admin, teamId } = await team();
    const send = (who: typeof admin, email: string, role = "member") =>
      as(who, `/api/teams/${teamId}/invites`, { method: "POST", ...json({ email, role }) });
    expect((await send(member, "x@example.com")).status).toBe(403);
    expect((await send(admin, member.email)).status).toBe(409);
    expect((await send(admin, "not an email")).status).toBe(400);
    expect((await send(admin, "x@example.com", "owner")).status).toBe(400);
    expect((await as(member, `/api/teams/${teamId}/invites`)).status).toBe(403);
  });
});

describe("members and roles", () => {
  it("lists members with their profiles", async () => {
    const { owner, member, teamId } = await team();
    const res = await as(member, `/api/teams/${teamId}/members`);
    expect(res.status).toBe(200);
    const members = (await res.json()) as TeamMember[];
    expect(members.map((m) => m.role)).toEqual(["owner", "admin", "member"]);
    expect(members[0]).toMatchObject({ userId: owner.id, email: owner.email });
  });

  it("lets Admins manage Members and Admins, and only Owners manage Owners", async () => {
    const { owner, admin, member, teamId } = await team();
    const setRole = (who: typeof owner, userId: string, role: string) =>
      as(who, `/api/teams/${teamId}/members/${userId}`, { method: "PATCH", ...json({ role }) });

    expect((await setRole(member, admin.id, "member")).status).toBe(403);
    expect((await setRole(admin, member.id, "admin")).status).toBe(200);
    expect((await setRole(admin, member.id, "owner")).status).toBe(403);
    expect((await setRole(admin, owner.id, "member")).status).toBe(403);
    expect((await as(admin, `/api/teams/${teamId}/members/${owner.id}`, { method: "DELETE" })).status).toBe(403);

    expect((await setRole(owner, admin.id, "owner")).status).toBe(200);
    expect((await getStore().teams.membership(teamId, admin.id))?.role).toBe("owner");
  });

  it("never leaves a Team without an Owner", async () => {
    const { owner, member, teamId } = await team();
    const demote = await as(owner, `/api/teams/${teamId}/members/${owner.id}`, {
      method: "PATCH",
      ...json({ role: "admin" }),
    });
    expect(demote.status).toBe(409);
    expect((await as(owner, `/api/teams/${teamId}/members/${owner.id}`, { method: "DELETE" })).status).toBe(409);

    // Anyone else may leave.
    expect((await as(member, `/api/teams/${teamId}/members/${member.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await getStore().teams.membership(teamId, member.id)).toBeNull();
  });

  it("lists the caller's Teams and lets admins rename one", async () => {
    const { admin, member, teamId } = await team();
    const teams = (await (await as(member, "/api/teams")).json()) as Team[];
    expect(teams).toMatchObject([{ id: teamId, role: "member" }]);

    const rename = { method: "PATCH", ...json({ name: "  Acme  " }) };
    expect((await as(member, `/api/teams/${teamId}`, rename)).status).toBe(403);
    const res = await as(admin, `/api/teams/${teamId}`, rename);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Team).name).toBe("Acme");
  });
});

describe("a Team's plan", () => {
  it("covers its members, and a lapsed Team is closed to them", async () => {
    const owner = await makeUser(undefined, { subscribed: false });
    const member = await makeUser(undefined, { subscribed: false });
    const team = await makeTeam(owner.id);
    await addMember(team.id, member.id);
    const project = await makeTeamProject(team.id);

    expect((await as(member, `/api/projects/${project.id}`)).status).toBe(402);

    // A member's own plan does not open a Team its Owners have not paid for.
    const paying = await makeUser();
    await addMember(team.id, paying.id);
    expect((await as(paying, `/api/projects/${project.id}`)).status).toBe(402);
    expect((await (await as(paying, "/api/projects")).json()) as Project[]).toEqual([]);
  });

  it("lets a member without a plan in when the Team's Owner has one", async () => {
    const { project, teamId } = await team();
    const member = await makeUser(undefined, { subscribed: false });
    await addMember(teamId, member.id);
    expect((await as(member, `/api/projects/${project.id}`)).status).toBe(200);
  });
});

describe("signInAllowed (AUTH_ALLOWED_EMAIL_DOMAINS)", () => {
  it("lets everyone in when no domains are listed", async () => {
    expect(await signInAllowed(getStore(), "anyone@anywhere.dev", [])).toBe(true);
  });

  it("lets in the listed domains, the invited, and members, and no one else", async () => {
    const store = getStore();
    const domains = ["acme.com"];
    expect(await signInAllowed(store, "Dana@ACME.com", domains)).toBe(true);
    expect(await signInAllowed(store, "dana@sub.acme.com", domains)).toBe(false);
    expect(await signInAllowed(store, "stranger@gmail.com", domains)).toBe(false);
    expect(await signInAllowed(store, null, domains)).toBe(false);

    const owner = await makeUser("owner@acme.com");
    const teamId = await teamOf(owner.id);
    const invite = await store.teams.createInvite({
      teamId,
      email: "contractor@gmail.com",
      role: "member",
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await signInAllowed(store, "contractor@gmail.com", domains)).toBe(true);

    const contractor = await makeUser("contractor@gmail.com");
    await store.teams.acceptInvite(invite.id, contractor.id, new Date());
    expect(await signInAllowed(store, "contractor@gmail.com", domains)).toBe(true);

    await store.teams.removeMember(teamId, contractor.id);
    expect(await signInAllowed(store, "contractor@gmail.com", domains)).toBe(false);
  });
});

