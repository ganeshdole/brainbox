# 9. Azure DevOps destination, connected with a token

Date: 2026-10-14

## Status

Accepted. Builds on ADR 0006 (integrations package) and ADR 0008 (Teams own
connections).

## Context

Customers whose engineering runs on Azure Boards, starting with the first to ask, copied
Brainbox reports into Azure DevOps by hand. A report there has to look
native: the right type, on the right team's board, the screenshot inline, and
the recording and voice note one click away.

Azure DevOps differs from GitHub in three ways that shaped this:

- **Brainbox has to store a credential.** The GitHub App mints its tokens from
  our key; Azure DevOps needs a token we keep.
- **What lands where is the process's business.** A team's board is its area
  path, and its sprint is an iteration. A team can show Bugs on the backlog,
  on the taskboard only (`asTasks`, as the first customer's team does) or nowhere. Bugs keep
  the report in Repro Steps, not Description. Processes add required fields
  of their own.
- **Sign-in options are in flux.** Azure DevOps OAuth apps take no new
  registrations. Entra ID is the supported user sign-in but needs publisher
  verification and doesn't cover personal-account orgs. Personal access
  tokens work everywhere.

## Decision

1. **Connect with a personal access token first.** A Team pastes an
   organization URL and a token (Work Items read & write, Project and Team
   read). Brainbox tries it before saving. One connection per organization
   per Team (`pat:<org>`). Entra sign-in is a later `auth` beside `"pat"`;
   nothing here assumes a PAT beyond `authFor()`.
2. **Credentials are sealed by the backend, not the store.** AES-256-GCM with
   `INTEGRATIONS_ENCRYPTION_KEY`, bound to the connection's team, provider and
   external id. Stores hold an opaque `SealedCredentials` string. That type
   only comes from `sealCredentials`, so plaintext can't be saved by mistake,
   and a store someone plugs in never needs the key. Without the key, Azure
   DevOps answers 503. Credentials never leave the backend.
3. **A rejected token stops deliveries until reconnected.** A 401 marks the
   connection `needs_reauth`. Deliveries through it then fail at once with
   "connect again" instead of calling out, and the dashboard asks for a new
   token. Pasting one for the same organization updates the connection in
   place and makes it active again.
4. **Bugs and feature requests are filed separately.** The destination holds
   one shape per kind: type, iteration, tags, priority and required fields.
   Feature requests default to the process's backlog item (User Story,
   Product Backlog Item, Requirement). A request's importance sets Priority
   (blocking 1, important 2, nice to have 3).
5. **Save proves the setup.** The backend reads each type's fields to work out
   where the report goes and whether it has a Priority. It then dry-runs a
   create of each kind (`validateOnly`). A rule the process enforces comes
   back as a 422 naming the type and field, and nothing is saved.
6. **Files go into Azure DevOps.** Screenshot, crop, screen recording and
   voice note are uploaded as attachments before the item is created, in one
   call, so they stay behind Azure DevOps sign-in. A file whose upload fails
   falls back to its public `/f/` link.
7. **Every new report is sent.** An Azure DevOps destination has no paused
   state: saving it means sending.

## Consequences

- `IntegrationProvider` gains `"azure-devops"`. `ProjectDestination` and the
  store's `DestinationRecord` are unions on `provider`, so `config` narrows.
  Postgres and Convex keep config as data; each store converts a row in one
  place.
- `integration_connections` gains `auth`, `status` and `credentials`
  (migration 0017). Convex connections without them read as active GitHub App
  installs.
- Losing or rotating `INTEGRATIONS_ENCRYPTION_KEY` makes stored tokens
  unreadable: every Team reconnects. Rotation without that is future work.
- Work items are created as the token's owner. A service account's token is
  the advice for anything shared.
- Two-way sync (Azure DevOps "Done" back into Brainbox) and Entra sign-in are
  later work. The plan is `docs/plans/azure-devops-integration.md`.
