# integrations - AGENTS.md

Where a report goes after it is stored (`@ganeshdole/brainbox-integrations`). A ticket in,
an issue in someone else's tracker out. No dependencies beyond
`@ganeshdole/brainbox-shared`. Root rules in `/AGENTS.md` apply; ADR 0006 explains why
this is its own package.

## What this package is

`Destination` is the seam: `deliver(ticket) → DeliveryResult`. `githubIssues()`
and `azureDevopsWorkItems()` implement it. `renderTicket()` (Markdown) and
`renderTicketHtml()` (HTML) read one content model in `ticket.ts`, so a change
to what a ticket says is made once for every format. `githubApp()` is the
GitHub App half: app JWT, installation tokens, the installation and its repos.
`verifyGithubSignature()` checks a webhook. For Azure DevOps, `azureDevops()`
reads what a setup UI needs (orgs, projects, teams, types, required fields),
`validateWorkItem()` dry-runs a configuration, and `entraApp()` is the
Microsoft Entra sign-in (PKCE, code exchange, refresh).

Which project has which destination, when `deliver` runs, retries, and what is
stored about the outcome are the host's business. `backend/` is one host.

## Rules that are specific here

- No framework, no database, no filesystem. The only I/O is `fetch`, and it is
  injectable (`fetch?: FetchLike`) so every test runs offline.
- `deliver()` never throws; it returns `{ ok: false, status?, error }`. The
  `githubApp()`, `azureDevops()` and `entraApp()` helpers do throw
  (`GithubApiError`, `AzureDevopsApiError`, `EntraError`): a failure there is
  the host's configuration or the provider itself, not one ticket.
- Web platform APIs only (`fetch`, `crypto.subtle`, `TextEncoder`, `atob`).
  Nothing from `node:*` in `src/` outside tests.
- A new destination is one file under `src/<provider>/` exporting a factory
  that returns a `Destination`, plus its tests and a README section.

## Tests

Vitest under Node with `fakeFetch` from `src/test/`. Assert the request that
went out and the result that came back. The RSA key in `app.test.ts` is
generated per run. Run: `pnpm -F @ganeshdole/brainbox-integrations test`.
