# @brainbox/integrations

Send a Brainbox report to the tracker a team already uses. A `Destination`
takes a `Ticket` and returns where it landed. GitHub issues is the first
destination; it works with a GitHub App installation or a plain token.

No dependencies beyond `@brainbox/shared`. Runs anywhere `fetch` and WebCrypto
exist: Node 20+, Bun, Deno, Cloudflare Workers, Vercel.

## Use

```ts
import { githubIssues, type Ticket } from "@brainbox/integrations";

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

Inside the monorepo the package is consumed from source. Outside it:

```sh
pnpm -F @brainbox/integrations pack   # emits a tarball with dist/
npm install ./brainbox-integrations-0.0.0.tgz
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
import { githubApp, githubIssues, verifyGithubSignature } from "@brainbox/integrations";

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

## Writing a destination

One file, one factory, no framework:

```ts
import { renderTicket, type Destination } from "@brainbox/integrations";

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
