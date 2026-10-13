# 8. Teams own projects

Date: 2026-10-13

## Status

Accepted. Changes the data hierarchy in `CONTEXT.md` from Account → Project
to Team → Project.

## Context

A company self-hosting Brainbox set it up and then found nobody else could
use it. Their teammates could sign in, since Auth.js creates an Account for
any address, but every project, and every GitHub connection, belonged to the
one Account that made it. About 25 route checks compared `ownerId` with the
caller, so a project had exactly one person who could open it, and there was
no way to add another.

Comparable products (Marker.io, Userback, BugHerd, Jam, Sentry, PostHog) all
put a workspace or organisation above the person. It owns projects,
integrations and billing; people join it with a small set of roles; and they
join through an email invite, a link to pass on, or their email domain.

## Decision

1. **A Team owns projects and connections.** `projects.team_id` and
   `integration_connections.team_id` replace `owner_id`. Members are
   `team_members` (team, user, role); a person can be in several Teams.
2. **Three roles.** Owner, Admin and Member. Members read every project's
   reports and resend them; Admins also manage projects, integrations and
   people; Owners also manage Owners. A Team always keeps an Owner, a rule
   both stores apply in the same atomic step as the change
   (`store/team-rules.ts`). Every member sees every project; per-project
   access is left for when a case needs it.
3. **One access check.** Routes ask `lib/access.ts` (`teamAccess`,
   `projectAccess`) for a minimum role. Outsiders get 404, so nothing is
   revealed; members without the role get 403. Roles are read from the store
   on each request, never kept in the session, so removing someone takes
   effect at once.
4. **The plan stays with the person.** A subscription is still an Account's,
   and a Team has access when one of its Owners does (`teamHasAccess`).
   Checkout and the payment webhooks are untouched. The paywall lets in
   anyone in a paying Team, and each Team's routes check that Team, so one
   Team's plan opens no other.
5. **Invites are bound to an address.** An invite names one email and is
   accepted only by an Account signed in as it, which Auth.js has verified.
   The link only points at the invite, so a forwarded link is no use to
   anyone else. Invites last 7 days, work once, and are replaced by inviting
   the address again. The invite routes sit outside the paywall, because
   joining a paying Team is how a newcomer gets covered.
6. **No email is fine.** The dashboard always offers the invite link to
   copy, because a self-hosted install may run the `console` email driver.
7. **Sign-in can be fenced.** `AUTH_ALLOWED_EMAIL_DOMAINS` limits sign-in to
   listed domains, plus anyone with an open invite or already in a Team.
8. **Existing data moves as it is.** Each Account that owned something gets a
   Team whose id is its own user id, with itself as Owner, so the move is a
   copy of `owner_id` (drizzle 0012, and `migrations:teams` on Convex).

## Consequences

- A project outlives whoever made it. Ownership moves by promoting someone
  to Owner, and the last Owner cannot leave.
- Convex keeps `teamId` optional in its schema until every deployment has run
  `migrations:teams`. A later change can make it required and drop `ownerId`.
- No plan caps how many members a Team has, for now. Brainbox prices by
  tickets, not seats; a cap on Pro is the lever if one is ever wanted.
- Members may be on Teams whose plan lapses. Their project list leaves such
  Teams out, rather than showing projects that would only meet the paywall.
- Not yet built: domain auto-join, per-project access and guests, SSO, team
  deletion, and an audit log.
