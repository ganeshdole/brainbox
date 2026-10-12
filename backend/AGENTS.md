# backend - AGENTS.md

The API (`@brainbox-sh/backend`): Hono + Drizzle + Postgres. Root rules in
`/AGENTS.md` apply; this covers what's specific here.

## Structure

- Routes live in `src/routes/*` and are mounted in `src/app.ts`. Add a route by
  exporting a Hono sub-app and wiring it in `app.ts`, minding the auth boundary
  below.
- DB schema is in `src/db/schema/`. Get the db inside a handler via
  `c.get("db")` (injected by `middleware/db.ts`) - don't import the client
  directly in route code.
- Env is read once through `src/env.ts`. Add new vars there with an explicit
  required/optional decision, not ad-hoc `process.env` reads elsewhere.

## The wire format is not here

`/ingest` parses its upload with `parseIngest()` from `@brainbox-sh/server`: the
multipart parts, the zod schema, file types and size caps. The route owns what
comes after - project lookup, origin allowlist, storage keys, the insert,
transcription. A change to what the widget sends goes in `packages/server`
(and `packages/shared`); a change to what we do with it goes here.

## Integrations

`src/integrations/registry.ts` turns a stored destination into a `Destination`
from `@brainbox-sh/integrations`; `dispatch.ts` (`deliverIssue`) sends an issue and
writes its `deliveries` row. A change to what a ticket says, or a new tracker,
goes in `packages/integrations`; which project sends where, and when, is here.
The GitHub App env (`GITHUB_APP_*`) is optional; `integrationsConfigured()`
gates the routes with a 503. Tests stub `fetch` with `test/github-fake.ts`, and
`test/env.ts` generates a throwaway app key per run.

## Auth boundary

`app.ts` gates routes in order: `/health`, `/ingest`, `/f` (signed public file
links for external tickets) and `/webhooks` are public; everything
under `/api/*` (except `/api/auth/*`) requires a valid Auth.js session. `/ingest`
is the widget's public endpoint - it authenticates by project key + origin
allowlist, never a session. Put new authenticated endpoints after the
`verifyAuth()` line; keep public ones before it.

## Drizzle gotcha

`.returning()` and `.select()` return arrays typed as possibly-empty under
`noUncheckedIndexedAccess`. Destructuring `const [row] = ...` gives `row: T |
undefined` - guard it (`if (!row) return c.json(..., 4xx/5xx)`) before use.

## Tests

Integration tests (`test/*.int.test.ts`) run against a REAL Postgres. Local
setup: copy `.env.test.example`, have Postgres reachable at the configured URL.
`test/global-setup.ts` creates `brainbox_test` and truncates between tests, so
they run serially - don't add cross-test state assumptions.

Use the fixtures in `test/helpers.ts` (`makeUser`, `makeProject`, `makeIssue`,
`authCookie`) instead of hand-rolling rows or minting cookies. `!` is allowed in
test files.

## Commands

- `pnpm -F @brainbox-sh/backend test` - run the suite (needs Postgres).
- `pnpm -F @brainbox-sh/backend db:generate` then `db:migrate` - after a schema
  change. `db:seed` loads dev data.
