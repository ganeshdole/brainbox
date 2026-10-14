# Self-hosting Brainbox

Brainbox runs on the database, file storage and host you already have. Pick
one of each; the backend reads the choice from its environment at boot and
refuses to start if a chosen option is missing its settings.

| Choice | Options | Setting |
|---|---|---|
| Database | `postgres` (default), `convex`, `custom` | `DATABASE_DRIVER` |
| Uploaded files | `local` (development only), `s3`, `r2`, `convex`, `custom` | `STORAGE_DRIVER` |
| Host | Node server (Docker), Azure Functions | which entry you deploy |

The two drivers are independent, so any database goes with any file store.
`postgres` is any Postgres: your own, Docker, Supabase, Neon, AWS RDS. `s3` is
anything that speaks the S3 API: AWS S3, MinIO, Supabase Storage, Backblaze B2,
DigitalOcean Spaces. `r2` is Cloudflare R2 with its settings filled in.
`custom` is a database or file store you write yourself (see the last section).

| You want | Set |
|---|---|
| Supabase for data, AWS S3 for files | `DATABASE_DRIVER=postgres` with Supabase's connection string, `STORAGE_DRIVER=s3` |
| Everything on AWS | `postgres` on RDS, `s3` with the keys left empty so the instance's IAM role is used |
| Everything on Convex | `DATABASE_DRIVER=convex`, `STORAGE_DRIVER=convex` |
| Postgres with Cloudflare R2 | `DATABASE_DRIVER=postgres`, `STORAGE_DRIVER=r2` |
| MongoDB, or anything else not listed | `DATABASE_DRIVER=custom` and your own `Store` |

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
| `STORAGE_DRIVER=s3` | `S3_BUCKET`, `S3_REGION`; `S3_ENDPOINT` for anything but AWS itself; `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` unless an IAM role supplies them; `S3_FORCE_PATH_STYLE=true` for MinIO and Supabase Storage |
| `STORAGE_DRIVER=r2` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| `DATABASE_DRIVER=custom` or `STORAGE_DRIVER=custom` | an entry that calls `setStore()` or `setStorage()` (below) |
| Sign-in with Google | `GOOGLE_ID`, `GOOGLE_SECRET` |
| Sign-in by email | `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| A code instead of a link | `AUTH_EMAIL_MODE=code`, or `both` for a code and a link in one email (default `link`) |

A code suits people who read email on a different device from the one they
sign in on, or whose mail scanner opens links before they do. Only the newest
code sent to an address works, and each address gets five attempts in any 15
minutes, which is also how long a code lives. The fifth wrong attempt cancels
the code, and no code is accepted until earlier attempts are 15 minutes old.
That also means anyone who knows an address can hold its email sign-in off
for 15 minutes at a time; Google sign-in is unaffected. Link-only sign-in has
no such limit, since its token cannot be guessed.

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

## Bringing your own database, file store or email

Write the interface (`Store` in `src/store/types.ts`, `Storage` in
`src/storage/index.ts`, `Emailer` in `src/email/types.ts`) and hand it to the
backend from an entry, before it serves:

```ts
// src/my-entry.ts, next to src/index.ts
import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { env } from "./env.ts";
import { setStore } from "./store/index.ts";
import { createMongoStore } from "./my-mongo-store.ts";

setStore(createMongoStore(process.env.MONGODB_URL ?? ""));
serve({ fetch: app.fetch, port: env.PORT });
```

With `DATABASE_DRIVER=custom` the backend skips the Postgres and Convex
settings. `setStorage()` and `STORAGE_DRIVER=custom` work the same way for
files, and `setEmailer()` for email (SES, SMTP).

A file store that hands out its own URLs, as S3 does, only needs `put` and
`presignGet`. One that serves files through the API instead also implements
`read`, and the file routes stream from it.

A store is done when the backend suite passes against it: the integration
tests are the contract (`backend/AGENTS.md`). To ship an option in this repo
instead, add it to `src/env.ts` and the driver switch beside the others.
