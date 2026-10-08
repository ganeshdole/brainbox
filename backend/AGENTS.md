# backend - AGENTS.md

The API (`@brainbox/backend`): Hono + Drizzle + Postgres. Root rules in
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

`/ingest` parses its upload with `parseIngest()` from `@brainbox/server`: the
multipart parts, the zod schema, file types and size caps. The route owns what
comes after - project lookup, origin allowlist, storage keys, the insert,
transcription. A change to what the widget sends goes in `packages/server`
(and `packages/shared`); a change to what we do with it goes here.

## Auth boundary

`app.ts` gates routes in order: `/health` and `/ingest` are public; everything
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

- `pnpm -F @brainbox/backend test` - run the suite (needs Postgres).
- `pnpm -F @brainbox/backend db:generate` then `db:migrate` - after a schema
  change. `db:seed` loads dev data.
