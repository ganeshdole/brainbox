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
`custom` is a database or file store you write yourself, though a backend
built from parts is the better way to bring one (see the last section).

| You want | Set |
|---|---|
| Supabase for data, AWS S3 for files | `DATABASE_DRIVER=postgres` with Supabase's connection string, `STORAGE_DRIVER=s3` |
| Everything on AWS | `postgres` on RDS, `s3` with the keys left empty so the instance's IAM role is used |
| Everything on Convex | `DATABASE_DRIVER=convex`, `STORAGE_DRIVER=convex` |
| Postgres with Cloudflare R2 | `DATABASE_DRIVER=postgres`, `STORAGE_DRIVER=r2` |
| MongoDB, or anything else not listed | your own `Store` in a backend built from parts |

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
| `DATABASE_DRIVER=custom` or `STORAGE_DRIVER=custom` | an entry that calls the deprecated `setStore()` or `setStorage()` (below) |
| Sign-in with Google | `GOOGLE_ID`, `GOOGLE_SECRET` |
| Sign-in by email | `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` |
| A code instead of a link | `AUTH_EMAIL_MODE=code`, or `both` for a code and a link in one email (default `link`) |
| Only your company signs in | `AUTH_ALLOWED_EMAIL_DOMAINS=acme.com` (comma-separated; unset lets anyone in) |
| GitHub destinations | `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` |
| Azure DevOps destinations | `INTEGRATIONS_ENCRYPTION_KEY` (below) |

A code suits people who read email on a different device from the one they
sign in on, or whose mail scanner opens links before they do. Only the newest
code sent to an address works, and each address gets five attempts in any 15
minutes, which is also how long a code lives. The fifth wrong attempt cancels
the code, and no code is accepted until earlier attempts are 15 minutes old.
That also means anyone who knows an address can hold its email sign-in off
for 15 minutes at a time; Google sign-in is unaffected. Link-only sign-in has
no such limit, since its token cannot be guessed.

## Azure DevOps

A Team connects an Azure DevOps organization with a personal access token
(Settings → Destinations), and each project then files every new report as a
work item on the board it picks. The token is stored, so it is sealed
(AES-256-GCM) with `INTEGRATIONS_ENCRYPTION_KEY`, a 32-byte key in base64:

```
openssl rand -base64 32
```

Without it, Azure DevOps answers 503 and the dashboard says it isn't set up.
An unusable key stops the backend from starting. Keep it with your other
secrets: changing or losing it makes every stored token unreadable, and each
Team has to paste its token again.

`AZURE_DEVOPS_URL` points the backend at another Azure DevOps (default
`https://dev.azure.com`). Development uses it for the local fake:
`pnpm -F @ganeshdole/brainbox-backend fake:ado`, then
`AZURE_DEVOPS_URL=http://localhost:8790`, organization `acme`, token
`fake-pat`.

The token needs **Work Items (Read & write)** and **Project and Team
(Read)**. Work items are created as the token's owner, so a service account's
token keeps working when people leave. When Azure DevOps rejects the token
(expired or revoked), deliveries stop and the dashboard asks for a new one.

## Teams, invites and who can sign in

Projects belong to a Team, and everyone in the Team sees all of its projects.
The first person to create a project gets a Team with themselves as Owner.
From there, an Owner or Admin opens **Team** in the dashboard sidebar and
invites people by email as Admin or Member.

An invite is accepted only by someone signed in as the invited address, and
works once within 7 days. With `EMAIL_DRIVER=resend` the invite is emailed.
Without email (the default `console` driver, which only logs), the dashboard
shows the invite link to copy and pass on by chat. Pending invites keep a
**Copy link** button too. People who sign in without the link see their
pending invites on the dashboard's home page.

By default anyone who can reach the dashboard can sign in and start a Team of
their own. To keep a company install to the company, set
`AUTH_ALLOWED_EMAIL_DOMAINS` to your domains, such as `acme.com,acme.io`.
Addresses on those domains can sign in. Anyone else can sign in only with an
open invite or while they are in a Team, so an outside contractor is invited
like anyone else, and removing them from every Team keeps them out. A
refused address is told to ask a team admin for an invite, and no sign-in
email is sent to it.

### Upgrading an install from before Teams

Projects and GitHub connections used to belong to the person who made them.
The upgrade gives each such person a Team named after them, with them as
Owner, and moves their projects and connections into it. Nothing changes for
them until they invite someone.

- **Postgres:** `pnpm -F @ganeshdole/brainbox-backend db:migrate` (migrations
  0012 and 0013) does it.
- **Convex:** after `npx convex deploy`, run once:

  ```sh
  npx convex run migrations:teams '{"secret":"<BRAINBOX_SERVER_SECRET>"}'
  ```

  Until it has run, the API refuses projects without a Team, and the error
  says to run it. Running it again changes nothing.

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

## Build your own backend from parts

The backend is also a library. `createApp()` builds the same Hono app the
shipped entries run, from parts you hand it instead of environment variables,
so you can bring your own database, file store, email, transcription or host
without editing the backend:

```ts
// my-backend.ts
import { serve } from "@hono/node-server";
import { createApp, groqTranscriber, S3Storage } from "@ganeshdole/brainbox-backend";

import { createMongoStore } from "./mongo-store.ts";

const app = createApp({
  store: createMongoStore(process.env.MONGODB_URL ?? ""),
  storage: new S3Storage({ bucket: "feedback", region: "eu-west-1" }),
  transcriber: groqTranscriber({ apiKey: process.env.GROQ_API_KEY ?? "" }),
  auth: { allowedEmailDomains: ["acme.com"] },
  options: {
    secret: process.env.AUTH_SECRET ?? "",
    publicUrl: "https://feedback-api.acme.com",
    dashboardOrigin: "https://feedback.acme.com",
  },
});

serve({ fetch: app.fetch, port: 8787 });
```

Only `store`, `storage` and `options` are required. Each part you leave out
turns its feature off:

| Part | Without it |
|---|---|
| `emailer` (any `Emailer`: `ResendEmailer`, or your own for SES or SMTP) | Emails are logged, not sent. Invites show a link to pass on by hand. |
| `transcriber` (`groqTranscriber`, `openaiTranscriber`, `aiSdkTranscriber`, or your own `Transcriber`) | Voice notes and recordings arrive without a transcript. |
| `integrations` (`github` for your GitHub App, `azureDevops` with an encryption key) | Those trackers answer 503 and the dashboard says they aren't set up. |
| `auth` (Google sign-in, email mode, allowed domains) | No dashboard API: the app receives reports, serves file links and runs webhooks, nothing more. Auth.js reads `AUTH_URL` from the environment if it is set. |
| `billing` (Dodo Payments settings) | No paywall. |

### Your own store

A `Store` (`backend/src/store/types.ts`) is a small required core, `projects`
and `issues`, which is all ingest and reading reports need. Everything else is
an optional module, each its own interface, and the app serves only the
modules your store has:

| Module | What it adds | Without it |
|---|---|---|
| `auth` | Accounts and sign-in (the Auth.js adapter, sign-in codes) | No dashboard API |
| `teams` | Teams, members and invites | Everyone who signs in shares every project |
| `triage` | Status, priority, close reason and the activity log | Reports keep the status they arrived with |
| `features` | Features and the requests attached to them | No features |
| `integrations` | Connections, destinations and deliveries | Reports go nowhere else |
| `billing` | Subscriptions from Dodo's webhooks | No paywall |
| `waitlist` | The marketing site's early-access list | No `/waitlist` |

So a store can start with the core alone and grow. Without `teams`, everyone
who can sign in owns every project, so `createApp` refuses to start unless
`auth.allowedEmailDomains` limits who that is. `GET /api/me` lists the
modules this backend has.

`createPostgresStore(connectPostgres(url))` and
`createConvexStore(createConvexCaller(url, secret))` are the two stores this
repo ships, with every module. A file store that hands out its own URLs, as
S3 does, only needs `put` and `presignGet`; one that serves files through the
API instead also implements `read`, and the file routes stream from it.

### Without a new entry

The shipped entries still run `createApp(fromEnv())`. `setStore()`,
`setStorage()` and `setEmailer()` with `DATABASE_DRIVER=custom` /
`STORAGE_DRIVER=custom` still swap a part into that app before it serves, but
they are deprecated: they take only a store with every module, and
`createApp` takes any. To ship an option in this repo instead, add it to
`src/env.ts`, map it in `src/from-env.ts`, and add it to the driver switch
beside the others.
