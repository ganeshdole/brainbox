# Self-hosting Brainbox

Brainbox runs on the database, file storage and host you already have. Pick
one of each; the backend reads the choice from its environment at boot and
refuses to start if a chosen option is missing its settings.

| Choice | Options | Setting |
|---|---|---|
| Database | `postgres` (default), `convex` | `DATABASE_DRIVER` |
| Uploaded files | `local` (development only), `r2`, `convex` | `STORAGE_DRIVER` |
| Host | Node server (Docker), Azure Functions | which entry you deploy |

Why it is built this way: [ADR 0007](adr/0007-pluggable-stores-and-runtimes.md).

## Settings for each option

Always required: `AUTH_SECRET` (`openssl rand -base64 32`), `PUBLIC_API_URL`
(where the backend is reachable), `AUTH_URL` (`<PUBLIC_API_URL>/api/auth`) and
`DASHBOARD_ORIGIN`. A self-hosted install usually sets `BILLING_DISABLED=true`.
Everything else is in `backend/src/env.ts`.

| Option | Needs |
|---|---|
| `DATABASE_DRIVER=postgres` | `DATABASE_URL`, then `pnpm -F @ganeshdole/brainbox-backend db:migrate` |
| `DATABASE_DRIVER=convex` or `STORAGE_DRIVER=convex` | `CONVEX_URL`, `BRAINBOX_SERVER_SECRET` (also set on the Convex deployment) |
| `STORAGE_DRIVER=r2` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Sign-in with Google | `GOOGLE_ID`, `GOOGLE_SECRET` |
| Sign-in by email | `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| A code instead of a link | `AUTH_EMAIL_MODE=code`, or `both` for a code and a link in one email (default `link`) |

A code suits people who read email on a different device from the one they
sign in on, or whose mail scanner opens links before they do. Five wrong codes
for one address within 15 minutes cancel every code pending for it, and no code
is accepted for that address until the 15 minutes are up.

## Keep the dashboard and the API on one site

The dashboard signs in with a cookie the API sets, and browsers block that
cookie between unrelated sites. Serve both from one site, in one of two ways:

- **From the API itself.** Copy the built dashboard next to the backend and set
  `DASHBOARD_DIR` to that folder, relative to the backend package. The API then
  answers the dashboard's pages too, on its own address, with no custom domain.
- **On two subdomains** of one domain, such as `feedback.example.com` and
  `api.feedback.example.com`.

Either way, build the dashboard with `VITE_API_URL` set to the API's address.

## Docker with Postgres

`compose.yaml` at the repo root runs Postgres, migrations, the API and the
static dashboard behind Caddy. See its header comment for the settings it reads.

## Azure Functions with Convex

`backend/` is already a function app: `host.json` and the `main` field in
`package.json` point the Functions host at the build of `src/azure.ts`.

1. **Convex.** Create a project in the Convex dashboard and a deploy key for
   it. From `backend/`:

   ```sh
   CONVEX_DEPLOY_KEY=<key> npx convex deploy
   CONVEX_DEPLOY_KEY=<key> npx convex env set BRAINBOX_SERVER_SECRET <a long random string>
   ```

   Never set `BRAINBOX_ALLOW_TEST_RESET` on this deployment: it lets the test
   suite empty every table.

2. **Function app.** Create a Linux function app on Node 22. Add the always
   required settings, plus:

   ```text
   DATABASE_DRIVER=convex
   STORAGE_DRIVER=convex
   CONVEX_URL=<the deployment URL from step 1>
   BRAINBOX_SERVER_SECRET=<the same string as step 1>
   ```

3. **Deploy from Linux** (CI or WSL), so the image library `sharp` installs its
   Linux binary:

   ```sh
   pnpm -F @ganeshdole/brainbox-backend build
   VITE_API_URL=<PUBLIC_API_URL> pnpm -F @ganeshdole/brainbox-dashboard build
   pnpm deploy --filter @ganeshdole/brainbox-backend --prod --legacy out/
   # pnpm deploy skips the git-ignored builds, as in the Dockerfile.
   cp -r backend/dist backend/host.json out/
   cp -r dashboard/dist out/dashboard
   cd out && func azure functionapp publish <app name>
   ```

4. **Dashboard.** With `DASHBOARD_DIR=dashboard` in the settings, the function
   app serves the dashboard on its own address, so no Static Web App or custom
   domain is needed. To host the dashboard separately instead, put it on an
   Azure Static Web App on the same parent domain as the API.
   `staticwebapp.config.json` (copied into the build) sends deep links such as
   `/projects/<id>/issues/<id>` to the app instead of a 404.

Run it locally first: `func start` in `backend/` after a build, with the same
settings in a git-ignored `backend/local.settings.json`, against a local Convex
deployment (`CONVEX_AGENT_MODE=anonymous npx convex dev`).

On Azure the `/ingest` response waits until transcription and ticket delivery
finish, because Azure may freeze the instance once it has responded.

## Pointing the widget at your install

Create a project in your dashboard, then give the widget your API and the
project's key:

```ts
brainboxTransport({ endpoint: "https://api.feedback.example.com/ingest", projectKey: "pk_..." })
```

## Adding another database, file store or host

Implement the interface (`Store`, `Storage`, or a thin entry like
`src/azure.ts`), add its option to `src/env.ts`, and make the backend suite pass
against it. `backend/AGENTS.md` has the rules.
