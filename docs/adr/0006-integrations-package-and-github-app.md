# 6. Integrations: a destination package, GitHub as a GitHub App

Date: 2026-10-11

## Status

Accepted. Builds on ADR 0005: the same "engine package, our apps consume it"
shape, applied to what happens after a report is stored.

## Context

The product promises that a report "lands in Linear, GitHub or Slack". Nothing
routed anywhere: a report stopped at the dashboard. GitHub is first, but the
second and third are already on the marketing page, so the first one decides
the shape for all of them. Since #71 the packages also run outside the
monorepo, and a host with its own backend should be able to route reports
without ours.

## Decision

### A package with one seam

`@brainbox/integrations` holds `Destination { kind, deliver(ticket) }`,
`renderTicket()` and `githubIssues()`. It depends on `@brainbox/shared` and
nothing else: `fetch` and WebCrypto only, so it runs on Node, Bun, Deno and the
edge runtimes. `deliver()` returns errors as data, like `parseIngest()`.

A `Ticket` is the destination-neutral form of a report, with links that work
without a session. `renderTicket()` turns it into a title and Markdown body
once, for every tracker. A new destination is one file that returns a
`Destination`.

The backend's `integrations/registry.ts` maps a stored destination to a
`Destination`, in the same shape as the transcription provider registry.

### GitHub App, verified with OAuth

A customer installs the Brainbox GitHub App and picks a repo. Issues are opened
by the app's bot with installation tokens minted per send (and cached in
memory), so no long-lived customer token is stored.

GitHub's redirect after an install carries `installation_id` in the query
string, so it can be forged: on its own it would let one Account claim another
org's installation. The app has "Request user authorization (OAuth) during
installation" turned on, and the callback exchanges the `code` and checks that
the installation is in the user's `/user/installations`. A signed `state`
ties the round-trip to the Account and project that started it.

A personal access token works through the same `githubIssues({ token })`, for
hosts that use the package without the app. The SaaS does not offer it.

### Three tables

`Account → Connection` (one per GitHub installation per Account),
`Project → Destination` (which repo, labels, paused or not; one per provider),
`Issue → Delivery` (status, the GitHub issue number and URL, last error,
attempts). The `(issue, destination)` unique index is the idempotency guard.
Deleting a destination sets `deliveries.destination_id` null, so the link to an
issue already opened survives a disconnect.

### Delivery in-process, after transcription

Ingest fires delivery in the background after transcription settles, so the
ticket carries the transcript. A failure is recorded on the delivery row, and
the dashboard shows it with a Retry. There is no queue: one box, low volume,
and every failure is visible and retryable. Revisit when ingest volume or a
second box makes lost in-flight deliveries on restart matter. The work is
already a single `deliverIssue(issueId)` call, so moving it onto a queue is
small.

### Public file links

A GitHub issue embeds the cropped screenshot, and GitHub fetches it with no
cookie, long after an R2 presign (1 hour) expires. `GET /f/:token` serves one
stored file per HMAC-signed key (keyed on `AUTH_SECRET`). Keys were already
unguessable; the signature stops enumeration.

## Consequences

- Linear or Slack is a destination file in the package, a provider in
  `IntegrationProvider`, a registry entry and its env. The tables do not change.
- Anyone who can see the GitHub issue can open its screenshot. That is the
  point, but it means a report's screenshot is as public as the repo it is
  filed in.
- Not built: two-way status sync (issues have no status yet), per-plan gating,
  a job queue, more than one destination per provider per project.
