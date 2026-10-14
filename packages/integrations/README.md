# @ganeshdole/brainbox-integrations

Send a Brainbox report to the tracker a team already uses. A `Destination`
takes a `Ticket` and returns where it landed. Two destinations ship: GitHub
issues (a GitHub App installation or a plain token) and Azure DevOps work items
(Microsoft Entra sign-in or a personal access token).

No dependencies beyond `@ganeshdole/brainbox-shared`. Runs anywhere `fetch` and WebCrypto
exist: Node 20+, Bun, Deno, Cloudflare Workers, Vercel.

## Use

```ts
import { githubIssues, type Ticket } from "@ganeshdole/brainbox-integrations";

const dest = githubIssues({
  owner: "acme",
  repo: "web",
  token: process.env.GITHUB_TOKEN, // a PAT with issues:write, or see "GitHub App"
  labels: ["feedback"],
});

const ticket: Ticket = {
  id: issue.id,
  createdAt: issue.createdAt,
  text: issue.text,
  transcript: issue.audio?.transcript,
  metadata: issue.metadata,
  region: issue.region,
  links: {
    dashboard: `https://app.example.com/feedback/${issue.id}`,
    crop: cropUrl, // must be reachable without a login
  },
};

const result = await dest.deliver(ticket);
if (result.ok) console.log(result.url); // https://github.com/acme/web/issues/42
else console.error(result.status, result.error);
```

`deliver()` never throws. A network failure, a bad token or a GitHub error all
come back as `{ ok: false, status?, error }`, so the caller records the outcome
in one place.

## Install

Inside this monorepo the package is consumed from source:

```json
{ "dependencies": { "@ganeshdole/brainbox-integrations": "workspace:*" } }
```

Outside it, from npm:

```sh
npm install @ganeshdole/brainbox-integrations
```

`pnpm build` emits `dist/` (JS plus `.d.ts`); the published package's
`exports` point at it (`publishConfig`).

## On its own

No Brainbox backend: with `@ganeshdole/brainbox-server` reading the widget's
upload, every report becomes a GitHub issue from one file (`bun server.ts`).
Files are not stored here, so the ticket links only to your own page for the
report.

```ts
import { parseIngest, DEFAULT_INGEST_LIMITS } from "@ganeshdole/brainbox-server";
import { githubIssues } from "@ganeshdole/brainbox-integrations";

const github = githubIssues({
  owner: "acme",
  repo: "web",
  token: () => process.env.GITHUB_TOKEN ?? "", // an empty token fails the delivery
});

export default {
  async fetch(request: Request): Promise<Response> {
    const parsed = await parseIngest(request, DEFAULT_INGEST_LIMITS);
    if (!parsed.ok) return Response.json(parsed.body, { status: parsed.status });

    const { payload } = parsed;
    const id = crypto.randomUUID();
    const result = await github.deliver({
      id,
      createdAt: new Date().toISOString(),
      kind: payload.kind,
      importance: payload.importance,
      text: payload.text,
      metadata: payload.metadata,
      region: payload.region,
      links: { dashboard: `https://admin.example.com/reports/${id}` },
    });
    // Nothing else kept the report: tell the widget it failed rather than drop it.
    if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ id, issue: result.url }, { status: 201 });
  },
};
```

## Destinations

```ts
interface Destination {
  readonly kind: string;                              // "github"
  deliver(ticket: Ticket): Promise<DeliveryResult>;
}

type DeliveryResult =
  | { ok: true; externalId: string; url: string }     // "42", the issue URL
  | { ok: false; status?: number; error: string };
```

`renderTicket(ticket)` produces the `{ title, body }` the GitHub destination
sends: the first line of the end-user's words as the title; the cropped
screenshot, the text, the transcript, a table of page/viewport/browser/user,
console errors in a `<details>`, and a link back to the dashboard. It is plain
Markdown, so a Linear or Jira destination can reuse it unchanged.
`renderTicketHtml(ticket, { crop?, screenshot? })` says the same as escaped
HTML, for trackers whose rich text is HTML, plus an `environment` table (page,
browser, viewport, locale) on its own. `crop` and `screenshot` are the
tracker's own copies of the images; each replaces the public link everywhere
it would appear.

A ticket can carry `files: { crop?, screenshot? }`, each
`{ name, contentType, load() }`, for destinations that keep their own copy of
the images instead of linking to them.

## GitHub

### With a token

`token` is a string or a function. A string is a personal access token
(fine-grained, `Issues: Read and write` on the repo). A function is called at
send time, so a short-lived token is never stale:

```ts
githubIssues({ owner, repo, token: () => app.installationToken(installationId) });
```

### As a GitHub App

For a SaaS, register a GitHub App (Settings → Developer settings → GitHub
Apps) with `Issues: Read and write` and `Metadata: Read-only`, subscribe to
the `Installation` event, turn on "Request user authorization (OAuth) during
installation", and download its private key.

GitHub hands out the key as PKCS#1 (`BEGIN RSA PRIVATE KEY`); WebCrypto needs
PKCS#8. Convert once:

```sh
openssl pkcs8 -topk8 -nocrypt -in app.pem -out app.pkcs8.pem
```

```ts
import { githubApp, githubIssues, verifyGithubSignature } from "@ganeshdole/brainbox-integrations";

const app = githubApp({ appId: "12345", privateKey: pkcs8Pem });

// After a customer installs the app, GitHub redirects to your setup URL with
// ?installation_id=N&code=C. installation_id alone can be forged: turn on
// "Request user authorization (OAuth) during installation" and check that the
// installing user can actually see it.
const app = githubApp({ appId, privateKey, clientId, clientSecret });
const userToken = await app.userToken(code);
const mine = (await app.userInstallations(userToken)).find((i) => i.id === installationId);
if (!mine) throw new Error("not your installation");
const repos = await app.installationRepos(installationId); // [{ fullName, private, ... }]

// Deliver as the app on that installation. Tokens are minted on demand and
// cached until shortly before they expire.
const dest = githubIssues({
  owner, repo,
  token: () => app.installationToken(installationId),
});

// On POST /webhooks/github:
const ok = await verifyGithubSignature(rawBody, req.headers.get("x-hub-signature-256"), secret);
```

`githubApp()` helpers throw a `GithubApiError` (with `status`) when GitHub
refuses: those failures are about the app's setup, not about one ticket.

Set `apiUrl` on both `githubApp()` and `githubIssues()` for GitHub Enterprise
Server.

## Azure DevOps

`azureDevopsWorkItems()` opens one work item per ticket. It uploads the
ticket's `files` (crop, screenshot, screen recording, voice note) as
attachments first, shows the image inline and links the rest from the report,
then creates the item, its fields and a link back to Brainbox in one call, so
a work item is never half-made. An uploaded file is never also linked
publicly; one whose upload fails falls back to its public link in `links`. A
current-sprint lookup for a team that no longer exists fails the delivery
rather than filing into the backlog.

Feature requests can be filed differently from everything else: `feature`
takes its own type, iteration, tags, priority and fields. Either way, a
request's importance replaces the priority (blocking 1, important 2, nice to
have 3) when the type has one.

Projects and teams are read page by page, so large organizations list in
full.

```ts
import { azureDevopsWorkItems } from "@ganeshdole/brainbox-integrations";

const dest = azureDevopsWorkItems({
  organization: "acme",
  project: "Web",
  workItemType: "Bug",
  auth: { pat: process.env.ADO_PAT }, // or { bearer: () => entraAccessToken() }
  areaPath: "Web\\Checkout",              // the team that owns this area sees it on its board
  iteration: { currentFor: "Web Team" },  // or { path: "Web\\Sprint 4" }; omitted: the backlog
  tags: ["brainbox", "feedback"],
  priority: 2,
  bodyField: "Microsoft.VSTS.TCM.ReproSteps",   // Bugs read Repro Steps, not Description
  systemInfoField: "Microsoft.VSTS.TCM.SystemInfo",
  fields: { "Custom.Product": "Store" },  // the process's own required fields
  feature: { workItemType: "User Story", iteration: { path: "Web" }, tags: ["feature-request"], priority: 3 },
});
```

A PAT needs *Work Items: Read & write* and *Project and Team: Read*. Set
`baseUrl` for Azure DevOps Server.

What a work item type expects depends on the project's process (Agile, Scrum,
CMMI, Basic or a custom one). The catalog helpers read it, for a setup UI:

```ts
import { azureDevops, validateWorkItem } from "@ganeshdole/brainbox-integrations";

const ado = azureDevops({ auth });
await ado.organizations();                     // Entra tokens only; a PAT is scoped to one org
await ado.projects("acme");                    // [{ id, name }]
await ado.teams("acme", project.id);
await ado.teamSettings("acme", project, team); // areas, sprints, backlog, and whether Bugs reach the board
await ado.workItemTypes("acme", project.id);   // hidden types (Test Case...) left out
await ado.workItemType("acme", project.id, "Bug"); // bodyField, systemInfoField, required fields

// Runs every rule without saving, for each kind of report: catches a missing
// required field or a renamed area before a report depends on the
// configuration. The error starts with the type it is about.
const check = await validateWorkItem(options); // { ok: true } | { ok: false, status?, error }
```

The catalog helpers throw `AzureDevopsApiError` (with `status`). A rejected
credential is reported as 401 even when Azure DevOps answers with a sign-in
page.

### Signing in with Microsoft Entra

Azure DevOps' own OAuth apps take no new registrations; Entra is the supported
way to act for a user. Register a multi-tenant app ("Accounts in any
organizational directory"), add the delegated **Azure DevOps** permissions
(`vso.work_write`, `vso.project`, `vso.profile`) and a client secret.

```ts
import { entraApp, pkcePair, EntraError } from "@ganeshdole/brainbox-integrations";

const entra = entraApp({ clientId, clientSecret, redirectUri });
const { verifier, challenge } = await pkcePair();
redirect(entra.authorizeUrl({ state, codeChallenge: challenge }));

// On the redirect back:
const tokens = await entra.exchangeCode(code, verifier);
// { accessToken, refreshToken, expiresAt, account: { tenantId, objectId, name, username } }

// Later. Microsoft rotates refresh tokens: store the one you get back.
try {
  const next = await entra.refresh(tokens.refreshToken);
} catch (err) {
  if (err instanceof EntraError && err.code === "invalid_grant") {
    // revoked or expired: the user has to sign in again
  }
}
```

Entra does not cover organizations backed by personal Microsoft accounts yet;
use a PAT for those.

## Writing a destination

One file, one factory, no framework:

```ts
import { renderTicket, type Destination } from "@ganeshdole/brainbox-integrations";

export function linearIssues(opts: { teamId: string; apiKey: string }): Destination {
  return {
    kind: "linear",
    async deliver(ticket) {
      const { title, body } = renderTicket(ticket);
      // ...call Linear, return { ok: true, externalId, url } or { ok: false, status, error }
    },
  };
}
```

Take `fetch` as an option so the tests can inject a fake, and never throw from
`deliver`.
