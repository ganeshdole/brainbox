# backend - AGENTS.md

The API (`@ganeshdole/brainbox-backend`): Hono over a `Store`. Postgres (Drizzle)
and Convex are the stores, picked by `DATABASE_DRIVER`. Root rules in
`/AGENTS.md` apply; this covers what's specific here.

## Structure

- Routes live in `src/routes/*` and are mounted in `src/app.ts`. Add a route by
  exporting a Hono sub-app and wiring it in `app.ts`, minding the auth boundary
  below.
- All persistence goes through the `Store` interface in `src/store/types.ts`.
  Inside a handler use `c.get("store")` (injected by `middleware/store.ts`);
  outside a request, `getStore()`. Never import the Drizzle client or schema
  outside `src/store/postgres.ts` and `src/db/`: another store has to be able to
  replace it. A new query is a new `Store` method, implemented by every store.
- Rules that every store must apply identically live as plain functions beside
  the stores (e.g. `store/subscription-write.ts`), not inside one store.
- The Postgres schema is in `src/db/schema/`. The Convex store is
  `src/store/convex.ts` over the functions in `convex/` (schema in
  `convex/schema.ts`); a schema change lands in both. Convex has no foreign
  keys, so its deleting mutations do the cascades Postgres does
  (`convex/lib/server.ts`).
- Every Convex function is built with `serverQuery`/`serverMutation`, which
  demand `BRAINBOX_SERVER_SECRET`: Convex functions are otherwise callable by
  anyone with the deployment URL. Never export a bare `query` or `mutation`.
- File storage is a separate choice (`STORAGE_DRIVER`: `local`, `s3`, `r2`,
  `convex`), behind the `Storage` interface in `src/storage/`. `r2` is a preset
  of `S3Storage`, so an S3-compatible store needs settings, not a driver. Ask
  the interface, never the class: routes check `storage.read`, not
  `instanceof LocalStorage`.
- `setStore()`, `setStorage()` and `setEmailer()` let an entry pass in its own
  implementation (`DATABASE_DRIVER=custom` / `STORAGE_DRIVER=custom`). Resolve
  them per use through `getStore()` / `getStorage()` / `getEmailer()`, never at
  import, or an injected one is missed. Tests use them to swap in fakes and
  pass `null` afterwards to go back.
- Env is read once through `src/env.ts`. Add new vars there with an explicit
  required/optional decision, not ad-hoc `process.env` reads elsewhere.

## Runtimes

`src/app.ts` is a web-standard Hono app; each host gets a thin entry around it.

- `src/index.ts` - the Node server (`pnpm start`, the Docker image).
- `src/azure.ts` - Azure Functions. `package.json` `"main"` points at its build
  and `host.json` clears the `/api` route prefix, so the backend folder is the
  function app. `runtime/azure-http.ts` converts requests and responses; Azure
  needs cookies in a separate field, so keep that path covered by its tests.

Work that outlives the response (transcription, delivery) goes through
`runInBackground(c, task)`, never a bare `void promise`: serverless hosts freeze
the instance once it responds, and the Azure entry waits for these tasks before
returning. Serverless filesystems are read-only, so `STORAGE_DRIVER=local` is
for development only.

## The wire format is not here

`/ingest` parses its upload with `parseIngest()` from `@ganeshdole/brainbox-server`: the
multipart parts, the zod schema, file types and size caps. The route owns what
comes after - project lookup, origin allowlist, storage keys, the insert,
transcription. A change to what the widget sends goes in `packages/server`
(and `packages/shared`); a change to what we do with it goes here.

## Integrations

`src/integrations/registry.ts` turns a stored destination into a `Destination`
from `@ganeshdole/brainbox-integrations`; `dispatch.ts` (`deliverIssue`) sends an issue and
writes its `deliveries` row. A change to what a ticket says, or a new tracker,
goes in `packages/integrations`; which project sends where, and when, is here.
The GitHub App env (`GITHUB_APP_*`) is optional; `integrationsConfigured()`
gates the routes with a 503. Tests stub `fetch` with `test/github-fake.ts`, and
`test/env.ts` generates a throwaway app key per run.

Azure DevOps connections store a token, which `integrations/azure-devops.ts`
seals with `INTEGRATIONS_ENCRYPTION_KEY` before `saveConnection` and opens
when it needs it. Stores keep the `SealedCredentials` string as it is and
never see the key; never hand a store plaintext. A 401 from a tool marks the
connection `needs_reauth` (`sendTicket` in `dispatch.ts`). Tests stub Azure
DevOps with `test/azure-devops-fake.ts`; `scripts/fake-azure-devops.ts` is a
fake to run against by hand and in `e2e/`.

## Auth boundary

`app.ts` gates routes in order: `/health`, `/ingest`, `/f` (signed public file
links for external tickets) and `/webhooks` are public; everything
under `/api/*` (except `/api/auth/*`) requires a valid Auth.js session. `/ingest`
is the widget's public endpoint - it authenticates by project key + origin
allowlist, never a session. Put new authenticated endpoints after the
`verifyAuth()` line; keep public ones before it.

Past the session, access is by Team (ADR 0008). A route that touches a Team,
or a project or connection it owns, asks `teamAccess`/`projectAccess` in
`lib/access.ts` for a minimum role and returns its response when refused.
Never compare ids by hand.

## Drizzle gotcha

`.returning()` and `.select()` return arrays typed as possibly-empty under
`noUncheckedIndexedAccess`. Destructuring `const [row] = ...` gives `row: T |
undefined` - guard it (`if (!row) return c.json(..., 4xx/5xx)`) before use.

## Tests

Integration tests (`test/*.int.test.ts`) are the contract every store must
pass. They run against a REAL Postgres by default: copy `.env.test.example`,
have Postgres reachable at the configured URL. `TEST_STORE=convex` runs the same
suite against a local Convex deployment instead (`CONVEX_AGENT_MODE=anonymous
npx convex dev` in `backend/`, plus the two `npx convex env set` lines that
`test/global-setup.ts` prints when they are missing). The store is emptied
between tests, so they run serially - don't add cross-test state assumptions.

Seed with the fixtures in `test/helpers.ts` (`makeUser`, `makeProject`,
`makeIssue`, `authCookie`) and assert on what was written with `stored` from
`test/harness.ts`. Never reach for one database's client in a test, or the
other store stops being tested. `!` is allowed in test files.

## Commands

- `pnpm -F @ganeshdole/brainbox-backend test` - run the suite (needs Postgres);
  `TEST_STORE=convex` runs it against local Convex.
- `pnpm -F @ganeshdole/brainbox-backend db:generate` then `db:migrate` - after a schema
  change. `db:seed` loads dev data.
- `func start` in `backend/` after a build - run under the Azure Functions host
  locally (Azure Functions Core Tools; settings in a git-ignored
  `local.settings.json`).
