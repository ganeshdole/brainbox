# integrations - AGENTS.md

Where a report goes after it is stored (`@brainbox-sh/integrations`). A ticket in,
an issue in someone else's tracker out. No dependencies beyond
`@brainbox-sh/shared`. Root rules in `/AGENTS.md` apply; ADR 0006 explains why
this is its own package.

## What this package is

`Destination` is the seam: `deliver(ticket) → DeliveryResult`. `githubIssues()`
is the first implementation. `renderTicket()` turns a `Ticket` into a title and
Markdown body and is shared by every ticket-shaped destination, so a change to
what a ticket says is made once. `githubApp()` is the GitHub App half:
app JWT, installation tokens, the installation and its repos.
`verifyGithubSignature()` checks a webhook.

Which project has which destination, when `deliver` runs, retries, and what is
stored about the outcome are the host's business. `backend/` is one host.

## Rules that are specific here

- No framework, no database, no filesystem. The only I/O is `fetch`, and it is
  injectable (`fetch?: FetchLike`) so every test runs offline.
- `deliver()` never throws; it returns `{ ok: false, status?, error }`. The
  `githubApp()` helpers do throw (`GithubApiError`): a failure there is the
  host's configuration or GitHub itself, not one ticket.
- Web platform APIs only (`fetch`, `crypto.subtle`, `TextEncoder`, `atob`).
  Nothing from `node:*` in `src/` outside tests.
- A new destination is one file under `src/<provider>/` exporting a factory
  that returns a `Destination`, plus its tests and a README section.

## Tests

Vitest under Node with `fakeFetch` from `src/test/`. Assert the request that
went out and the result that came back. The RSA key in `app.test.ts` is
generated per run. Run: `pnpm -F @brainbox-sh/integrations test`.
