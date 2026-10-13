# Plan: issue triage (status, priority, assignee, comments)

Status: proposal, 2026-10-13. A plan describes intent, not what exists (see
AGENTS.md). Nothing here is built yet.

## The problem

Today an Issue is write-once. It arrives through `/ingest`, the dashboard lists
it newest-first, and the only thing a Customer can do with it is read it, copy
it, or (re)send it to GitHub. There is no way to say "handled", "this one
first", "yours", or "I tried this and it's not reproducible".

So the Reports page is a feed, not an inbox. With five reports a week that's
fine. With fifty, the Customer can't tell what's left, rereads what they've
already handled, and stops opening the dashboard. Every feature we ship after
capture (replay, transcripts, crops) is wasted on a report nobody gets to.

What exists to build on:

- `Issue` has no lifecycle fields (`packages/shared/src/issue.ts`,
  `backend/src/db/schema/issues.ts`, `backend/convex/schema.ts`).
- The only issue routes are `GET /issues/:id` and `POST /issues/:id/deliveries`
  (`backend/src/routes/issues.ts`).
- An Account is one login and projects have `ownerId`. **Teams are being built
  separately** (the "Add Team Invites and SSO" thread, branch
  `t3/add-team-invitations`). Its design, which this plan depends on:
  - A **Team** owns projects, GitHub connections and the subscription. The
    hierarchy becomes `Team ──< Project ──< Issue`.
  - Members are `owner | admin | member`, stored in a `team_members` table.
    In v1 every member sees every project in the team.
  - The roughly 25 inline `ownerId !== uid` checks become one helper,
    `requireTeamRole(c, { projectId | teamId }, minRole)`. Roles are read from
    the database on every request.
  - Removing a member never deletes what they made.
  - Its "Later" row lists report assignment, status, comments and new-report
    emails. **This plan is that row.**
- The GitHub App only subscribes to `installation`; we never hear back when an
  issue we opened is closed.
- Host apps can pass the End-user's identity (`metadata.identity.email`), so we
  often know who to tell when their report is fixed.

## How competitors handle it

| Tool | Statuses | Priority | Assignee | Comments | Tracker sync | Tells the reporter |
|---|---|---|---|---|---|---|
| Marker.io | Open, In progress, Waiting for approval, Resolved, Closed | - | yes | team comments, @mentions | closed in GitHub/Jira/Trello → Resolved, reopen goes back | email on resolve; reporter can reopen |
| BugHerd | Kanban columns (Backlog, To do, In progress, Done, custom) | severity | yes | yes; guests see their own | Jira etc. | guests see the column their item is in |
| Userback | configurable workflows | yes | yes | reply to reporter vs internal note | Jira, Linear, GitHub… | auto-reply on receipt/resolve, reopen on reply |
| Usersnap | Open, In progress, Review, Done | labels | yes, notifies assignee | reply (emails reporter) vs internal note | yes | replies by email, guest board |
| Feedbucket | open / resolved | - | - | yes | comments both ways (GitHub with an `@feedbucket` prefix), status both ways on GitLab/Linear/Jira | - |
| Jam | intake only | set in the tracker | set in the tracker | in the tracker | sends to Jira/Linear with fields set | - |
| Linear (Triage) | Triage inbox: accept, duplicate, decline, snooze | Urgent/High/Medium/Low/None | yes | yes | n/a | decline/accept comment reaches the submitter |
| Sentry | Unresolved, Resolved, Archived (+ regressed) | - | yes | activity notes | n/a | - |

Patterns that show up in nearly every tool:

1. **A small fixed set of statuses.** Only Userback lets you configure them,
   and that's an upmarket feature. Everyone has an "open" and a "done" state,
   plus one that means "won't do".
2. **A triage state.** New reports land in an inbox you clear (Linear Triage,
   Sentry's "New"). The useful question is "what haven't I looked at?", not
   "show me everything".
3. **Two kinds of comment.** Internal notes for the team, and a reply that
   reaches the reporter (Userback, Usersnap). Keep these apart in the data from
   day one, even if v1 only ships internal notes.
4. **The tracker is the source of truth once connected.** Marker and Feedbucket
   don't try to beat Jira or GitHub. They follow its state, and closing the
   issue there resolves it here.
5. **Closing the loop with the reporter is the selling point.** Marker,
   Userback and Usersnap all say it on their marketing pages. In-app feedback
   gets more reports when people see their earlier ones get fixed.
6. **Activity log.** Every status, priority or assignee change is recorded and
   shown on the issue (Userback's Activity tab, Linear, Sentry).

## Product stance

Brainbox's ICP is a founder or small product team (CONTEXT.md). Two kinds of
Customer use it:

- **No tracker connected:** the dashboard is their whole workflow. They need a
  real inbox: status, priority, and notes.
- **GitHub connected:** GitHub is where work happens. The dashboard should
  follow GitHub's state, not compete with it.

We are **not** building a second Jira. Out of scope: custom workflows, Kanban
boards, due dates, SLAs, sprints, sub-tasks, time tracking. We give every
Customer a clean inbox with a small fixed workflow, mirror the tracker when
there is one, and do what trackers can't: tell the End-user their report was
fixed.

## The model

### Status (fixed set)

```
new ──► open ──► in_progress ──► resolved
  │       │           │
  └───────┴───────────┴────────► closed   (won't fix / duplicate / can't reproduce)
```

- `new`: just arrived, nobody has looked yet. This is the triage inbox. Every
  ingested issue starts here.
- `open`: accepted and still to do.
- `in_progress`: someone is on it.
- `resolved`: fixed. Can be reopened.
- `closed`: won't be acted on. Carries a `closeReason`:
  `wont_fix | duplicate | not_reproducible | spam`. A duplicate can point at
  its original (`duplicateOfId`).

Opening an issue in the dashboard does **not** move it out of `new`. Accepting
it does, in one click or keystroke. This matches Linear: "seen" and "triaged"
are different things.

Existing issues are backfilled to `open`, so a Customer with 400 old reports
doesn't get an inbox of 400.

### Priority

`none | low | medium | high | urgent`, the same scale as Linear and GitHub
Projects, so it maps across with no translation. The default is `none`. Sorting
by priority puts `urgent` first and `none` last.

### Assignee

One member of the project's Team, or nobody. This needs Teams (phase 3).
When a member is removed from the Team, their open issues become unassigned
and the change is logged. Their comments and events stay, shown as "Former
member", which follows Teams' rule that removal never deletes work.

### Who can do what

This adds rows to the Teams permission table. Triage is everyday work, so
plain Members can do all of it. Only settings stay with Admin and Owner.

| Action | Owner | Admin | Member |
|---|---|---|---|
| Change status and priority, bulk edit | ✓ | ✓ | ✓ |
| Assign or unassign anyone | ✓ | ✓ | ✓ |
| Comment; edit or delete own comments | ✓ | ✓ | ✓ |
| Delete anyone's comment | ✓ | ✓ | - |
| Turn on GitHub status sync and reporter emails | ✓ | ✓ | - |

All issue routes call `requireTeamRole(c, { projectId }, "member")`.
Settings routes require `"admin"`. When Teams later adds Guest and Viewer
roles: a Viewer gets read-only triage fields, and a Guest never sees
`internal` comments.

### Comments

`issue_comments`: `body` (Markdown), `authorId`, `visibility: internal |
reporter`. In v1 everything is `internal`. `reporter` turns on with
close-the-loop (phase 5). Authors can edit and soft-delete their own comments.

### Activity

`issue_events`, append-only: `actor` (`user:<id>`, `github`, `system`),
`kind` (`status`, `priority`, `assignee`, `comment`, `delivery`), `from`,
`to`, `at`. The issue page shows one timeline that interleaves comments and
events. Every write goes through the store in one transaction, so the issue
change and its event row can't come apart.

## Phases

Each phase ships on its own, with tests, and leaves `pnpm verify` green.

**Order relative to Teams.** Teams phase 1 rewrites every ownership check and
moves `projects.ownerId` to `teamId`. Issue routes and stores built before that
would be rewritten again. So:

1. Start this work **after Teams phase 1 merges**, branched from `main`. Or,
   if the two run in parallel, stack this branch on `t3/add-team-invitations`.
   Don't build it on today's `ownerId` checks.
2. Use `requireTeamRole` from the start. `issue_events.actorId` and
   `issue_comments.authorId` are user ids, shown with the name the Team
   members list gives them.
3. Phases 1 and 2 need Teams' access helper but not its invites, so they can
   start as soon as Teams' schema and helper land, even before its UI is done.

### Phase 1: Status and priority (the inbox)

Delivers most of the value: "mark as done" and "prioritise".

- **shared**: `IssueStatus`, `IssuePriority`, `IssueCloseReason`. `Issue`
  gains `status`, `priority`, `closeReason?`, `duplicateOfId?`,
  `statusChangedAt`.
- **backend**: migration (Postgres) plus Convex schema and validators.
  Backfill existing rows to `open`/`none`. Index on
  `(project_id, status, created_at)`. `Store.issues.update(id, patch, actor)`
  writes the patch and an `issue_events` row together. Both stores go through
  the shared integration suite.
- **API**:
  - `PATCH /issues/:id` takes `{ status?, priority?, closeReason?, duplicateOfId? }`.
    It is zod-validated, gated by `requireTeamRole(..., "member")`, and rejects
    transitions that make no sense (a `closeReason` without `closed`).
  - `PATCH /issues` takes `{ ids: string[], patch }` for bulk edits, capped at
    100 ids. Every id must be in a project the caller's Team can reach, and an
    id that isn't answers 404 like the rest of the API.
  - `GET /issues/:id/activity`.
- **dashboard**:
  - Reports page tabs: **Inbox** (`new`), **Open** (`open` +
    `in_progress`), **Done** (`resolved` + `closed`), **All**. Counts on the
    tabs. The existing type filters (Replays, Recordings, With errors) stay as
    a second filter.
  - Row: a status dot and a priority icon. Sort by newest or by priority.
  - Issue pane header: status menu, priority menu, "Resolve" button. Closing
    asks for a reason.
  - Multi-select rows, then a bulk bar to set status or priority.
  - Keyboard shortcuts in the pane: `e` resolve, `a` accept, `p` priority,
    `j`/`k` next and previous. Triaging fifty reports has to be fast.
  - An activity list at the bottom of the pane.
- **integrations**: priority goes into `renderTicket()` as a GitHub label
  (`priority: high`) when it is set before delivery. Optional, behind the
  destination's labels setting.

### Phase 2: Comments (internal notes)

- `issue_comments` table in both stores. `GET/POST /issues/:id/comments`,
  `PATCH/DELETE /issues/:id/comments/:commentId` (author only).
- The issue pane gets a timeline: comments and activity events interleaved,
  newest at the bottom, with a Markdown composer. Rendering uses the safe
  Markdown already used for the ticket preview, or a sanitized subset.
- Comments are useful even in a one-person Team: a solo founder writes notes
  to themselves ("repro on Safari 17 only"). @mentions come in phase 3.

### Phase 3: Assignment and member notifications

Teams, members, invites and the migration all belong to the Teams work. This
phase only uses them.

- **Assignee**: `issues.assigneeId`, a user id, nullable. The API checks that
  the user is a member of the project's Team when assigning. The pane gets an
  assignee menu listing the Team's members, the Reports page gets an "Assigned
  to me" tab, and bulk edit can set the assignee.
- **Member removed**: the Teams removal path (in its store method, in the same
  transaction) clears `assigneeId` on that member's issues in the Team and
  writes an `assignee` event with actor `system`.
- **@mentions** in comments use the Team members list. A mention is stored as
  the user id, so a later rename still shows correctly.
- **Notifications** (email, through the existing email driver): you're
  assigned; you're @mentioned; someone comments on an issue assigned to you;
  and, the item listed under Teams' "Later", a new report lands in a project
  (off by default, per member per project). Each member can turn these off.
  A daily digest can come later.
  On self-hosted installs with `EMAIL_DRIVER=console` these only log; the
  in-app "Assigned to me" tab covers that case.
- CONTEXT.md gains Status, Priority and Assignee in the glossary.

### Phase 4: GitHub two-way status sync

- Subscribe the GitHub App to `issues` events (and later `issue_comment`). The
  App already has `Issues: read and write`, so this is only a webhook
  subscription in the App settings and in `docs/self-hosting.md`.
- `webhooks.post("/github")` handles `issues.closed`, `issues.reopened` and
  `issues.deleted`. It looks up the delivery by `(installation, repo,
  externalId)` and updates the Brainbox issue with actor `github`.
  `closed` with `state_reason: not_planned` maps to `closed / wont_fix`, and
  everything else maps to `resolved`. Event ids keep the existing idempotency
  record.
- The other direction is a per-destination toggle, "Close the GitHub issue
  when resolved in Brainbox", off by default. It calls the
  integrations package (`githubIssues().close(...)`, a new method on the
  `Destination` seam as an optional `setState`).
- Loops: we ignore webhook events caused by our own App (`sender.type ==
  "Bot"` and our app id), so a close here doesn't echo back.
- Not in scope: syncing assignees and comments. GitHub users and Brainbox
  members aren't the same people. The issue pane already links to the GitHub
  issue for the discussion there.

### Phase 5: Close the loop with the End-user

The part trackers can't do, and the one to market.

- Per-project setting: "Email the reporter when their report is resolved"
  (needs `identity.email`). The email is short, branded with the project name,
  and contains a thank-you plus an optional Customer-written line. No dashboard
  link, because the End-user has no account.
- `reporter` comment visibility: "Reply to reporter" in the composer sends the
  comment by email. Replies come back through an inbound address and land as
  comments. Inbound email is its own sub-project, so ship send-only first.
- Plan gating: a good fit for **Business** next to "API access & webhooks".
  Also emit `issue.status_changed` on the outbound webhook Business already
  advertises.
- Later: a "your reports" view in the widget, using the End-user identity the
  host already passes in.

## Risks and decisions to make

1. **Dependency on Teams.** Teams phase 1 rewrites every ownership check, the
   billing gate and both stores. This plan waits for its schema and
   `requireTeamRole` helper, then builds on them (see "Order relative to
   Teams"). If both branches change `backend/src/routes/issues.ts` at the same
   time, expect merge conflicts, which is why the plan stacks rather than
   running in parallel.
2. **Postgres and Convex parity.** Every new table and field goes in twice,
   behind the shared `Store` suite. Budget for it in each phase.
3. **"new" for old data.** Backfilling to `open` is deliberate. Otherwise the
   first thing every current Customer sees is an inbox of hundreds.
4. **Sync conflicts.** GitHub wins for status when a destination is connected
   and sync is on. Brainbox changes push only when the toggle is on. Every
   change is in the activity log, so a surprise can be explained.
5. **Reporter email deliverability and consent.** This sends from our domain
   on the Customer's behalf. Each email needs an unsubscribe link and a
   per-project opt-in, and stays off by default.

## Open questions

- Is `in_progress` worth having for a solo founder, or is
  `new / open / resolved / closed` enough? (Recommendation: keep it. It costs
  nothing and Marker, Usersnap and Userback all have it.)
- Should "new report" emails go to every member by default, or only the Team
  Owner (as BugHerd's "Project Owner" does)? (Recommendation: Owner only by
  default, and members opt in per project.)
- Should close-the-loop be Business-only, or in Pro as a reason to upgrade
  from free?
- Should priority be set automatically from signals (console errors, rage
  clicks) as a suggestion? This is a nice later add-on and not part of the core.

## How we'll know it worked

- Share of issues that leave `new` within 7 days (target above 70%).
- Median time from ingest to `resolved`.
- Weekly active dashboard users per Team (should rise as Teams add members).
- For close-the-loop projects: change in reports per End-user after their
  first "resolved" email.

## Sources

- Marker.io: [status sync](https://help.marker.io/en/articles/5096332-status-sync), [issue page](https://help.marker.io/en/articles/6559060-understanding-and-navigating-the-marker-io-issue-page), [status updates sync](https://marker.io/blog/status-updates-sync)
- BugHerd: [managing feedback](https://support.bugherd.com/en/articles/11467195-chapter-5-managing-your-feedback-efficiently)
- Userback: [managing feedback](https://support.userback.io/en/articles/5209183-managing-feedback), [automations](https://support.userback.io/en/articles/10198801-automate-your-feedback-management)
- Usersnap: [feedback list](https://help.usersnap.com/docs/usersnap-dashboard-management)
- Feedbucket: [GitHub](https://help.feedbucket.app/en/article/feedbucket-and-github-integration-1t0c6ef/), [GitLab](https://help.feedbucket.app/en/article/feedbucket-and-gitlab-integration-lwm36k/)
- Linear: [Triage](https://linear.app/docs/triage)
- Sentry: [issue states](https://docs.sentry.io/product/issues/states-triage/)
- Jam: [Linear integration](https://linear.app/integrations/jam)
