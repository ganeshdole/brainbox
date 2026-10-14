# Plan: Azure DevOps destination

Status: Phase 1 with personal access tokens built, 2026-10-14. A plan is
intent, not canon (see `AGENTS.md`). The decisions made are in ADR 0009; the
facts are in the package README, `CONTEXT.md` and `docs/self-hosting.md`.

## Build status (2026-10-14)

Built: PAT connect, sealed credentials on both stores, the destination with a
separate shape for feature requests (importance → Priority), validate-on-save
(422), "Send a test report", `needs_reauth` on a rejected token, screenshot,
recording and voice note uploaded as attachments, the dashboard's
Destinations section, docs, and `e2e/tests/azure-devops.spec.ts` against the
fake.

Phase 2, first part (stacked on Phase 1): work item updates come back
through a "Work item updated" service hook (`/webhooks/azure-devops`, one
shared `AZURE_DEVOPS_HOOK_SECRET`). They're recorded once per revision, move
triage by state category, and go on to the host app as a signed, versioned
event (`STATUS_WEBHOOK_URL`, `docs/status-webhook.md`). The subscription is
made by hand (`docs/self-hosting.md`).

Not built yet: Entra "Sign in with Microsoft" (section 2's main path; the
`auth` field and `authFor()` are the seam), reconnect emails, "retry N failed
reports", creating the service hook from Brainbox, automatic retries of the
status webhook, Brainbox comments back to Azure DevOps, Phase 3, and the
marketing page.

## 1. The problem

A Customer whose engineering team runs on Azure Boards today reads Brainbox
reports in our dashboard and copies them into Azure DevOps by hand. They want
every report to land as a work item on the right **team's board**, with enough
in it to reproduce the bug, without anyone triaging it first.

Who is involved:

| Person | What they need |
|---|---|
| Customer admin (sets Brainbox up) | Connect once, pick org → project → team, done in under 5 minutes. Know when it breaks. |
| Their Azure DevOps / Entra admin | Least-privilege access, an app they can approve, no long-lived secrets lying around. |
| Developer triaging the board | A work item that looks native: the right type, area and sprint, the screenshot inline, browser details where ADO expects them, a link back to the full report and replay. |
| End-user who reported it | (Phase 2) to hear that it was fixed. |

## 2. How Azure DevOps works (what the design has to fit)

- **Hierarchy:** Organization (`dev.azure.com/{org}`) → Project → Teams. A
  work item belongs to a project, not a team.
- **What puts an item on a team's board** is its **Area Path**: each team owns
  one or more area paths (its "team field values"), and the board shows items
  under them. The **Iteration Path** decides backlog vs. a sprint. So "send to
  team X" means "set `System.AreaPath` to team X's default area".
- **Bugs may not show on a board at all**: each team has a "working with bugs"
  setting (`bugsBehavior`: with requirements / with tasks / off). If it is off,
  a Bug lands in the project but on no backlog. Setup has to warn about this.
- **Work item types depend on the process**: Agile (Bug, User Story, Task,
  Issue), Scrum (Bug, Product Backlog Item, Impediment), CMMI (Bug,
  Requirement, Issue), Basic (Issue, Task, Epic), plus inherited custom
  processes with custom types and **custom required fields**.
- **Where the body goes depends on the type**: a Bug's form shows
  `Microsoft.VSTS.TCM.ReproSteps` (and `Microsoft.VSTS.TCM.SystemInfo`), not
  `System.Description`. Writing a Bug's body to Description hides it.
- **Rich text is HTML.** Markdown for large text fields arrived in July 2025
  via a `/multilineFieldsFormat/<field>` patch op, but it is per-item,
  irreversible, and reportedly errors on orgs without the feature. HTML works
  everywhere, including Azure DevOps Server.
- **Create** is `POST {org}/{project}/_apis/wit/workitems/${type}` with a JSON
  Patch body (`application/json-patch+json`). `validateOnly=true` runs every
  rule without saving, which is how setup can prove a config works.
- **Attachments**: `POST {org}/{project}/_apis/wit/attachments?fileName=` with
  the bytes returns a URL; the create patch adds it as an `AttachedFile`
  relation and the HTML body can `<img src>` it. The image then lives inside
  ADO behind ADO's own auth.
- **Service hooks** (`_apis/hooks/subscriptions`, consumer `webHooks`) post
  `workitem.updated` / `workitem.commented` events to a URL, with basic auth or
  custom headers. Creating one needs project-admin-level rights.
- **Rate limits** are per-identity TSTUs; a throttled call gets `429` with
  `Retry-After`.

### Authentication: the deciding constraint

- **Azure DevOps OAuth apps** (what Jam and Marker.io use, gated by the org
  policy "Third-party application access via OAuth") **stopped accepting new
  registrations in April 2025** and are fully deprecated in 2026. Not an
  option for us.
- **Microsoft Entra ID OAuth** is the supported path: a multi-tenant Entra app
  with delegated Azure DevOps permissions (resource
  `499b84ac-1321-427f-aa17-267ca6975798`), authorization code flow, refresh
  tokens. The third-party OAuth org policy does **not** apply to it.
  Caveats:
  - It does **not support orgs backed by personal Microsoft accounts (MSA)**
    yet. Small teams on `@outlook.com` orgs can't use it.
  - Many tenants block user consent to apps from unverified publishers, so the
    app needs **Microsoft publisher verification**, and some tenants will still
    need an admin to grant consent.
  - Orgs with "IP Conditional Access on non-interactive flows" will reject our
    backend unless its egress IPs are allowed.
- **Personal access tokens** still work everywhere (cloud, MSA orgs, Azure
  DevOps Server), but tenants can cap their lifetime, restrict their creation,
  and global PATs are being removed (creation blocked March 2026, existing ones
  dead December 2026). Fine as a fallback, scoped to one org.
- **Service principals** (app-only, the customer adds our app as a user of
  their org) give a bot identity that survives staff leaving. Enterprise
  follow-up, not v1.

**Decision:** Entra OAuth as the main "Connect Azure DevOps" button; an
org-scoped PAT as the fallback ("Use a token instead") for MSA orgs, Azure
DevOps Server and self-hosters. Service principal later.

## 3. What others ship (market check)

| Product | Connect | What the user picks | Sync back |
|---|---|---|---|
| Jam | Legacy ADO OAuth (needs the third-party OAuth policy on) | Project, team, priority, assignee, "edit fields" | None documented |
| Marker.io | Legacy ADO OAuth, admin recommended | Project; show/hide fields, preset values (priority); separate member/guest forms | ADO "Done" → resolves in Marker + emails the reporter; comments Marker → ADO |
| Sentry | OAuth / PAT, recommends a service account | Project, work item type; alert rule auto-creates | Two-way status, assignee, comments |
| TestingBot / BrowserStack | OAuth or PAT | Project, work item type, limited custom fields | None |

Takeaways:

1. **Table stakes:** org → project → team → type, tags, priority, screenshot
   attached, link back. Everyone has this.
2. **The differentiator is closing the loop**: Marker.io's "ADO Done → reporter
   gets an email" is the feature a feedback widget can do that a bug tracker
   can't. That is our Phase 2.
3. **Everyone fights required custom fields.** Validating at setup (via
   `validateOnly`) and letting the admin fill defaults removes the most common
   support ticket.
4. **Competitors rely on the deprecated OAuth app type.** Starting on Entra
   avoids a forced migration and the "turn on third-party OAuth" setup step
   that security teams dislike. Worth saying on the marketing page.
5. **Recommend a service account** for the connecting user (Sentry does): items
   are "Created by" whoever connected, and deliveries stop if they leave.

## 4. The experience

### Setup (Project → Settings → Destinations → Azure DevOps)

1. **Connect.** "Sign in with Microsoft" (Entra). Fallback link: "Personal
   Microsoft account or Azure DevOps Server? Use a token" → org URL + PAT with
   scopes *Work Items (Read & write)* and *Project and Team (Read)*, validated
   on submit.
2. **Organization** - every org the identity can reach (or the PAT's org).
3. **Project** → **Team**. Picking a team pre-fills:
   - **Area path**: the team's default area (editable to any of its areas).
   - **Iteration**: "Team backlog" (default) or "Current sprint" (resolved at
     send time, so it follows the sprint), or a fixed iteration.
4. **Work item type**: types the project's process has, defaulting to Bug,
   else Issue. If Bug and the team has bugs off its backlog, warn: "This team
   doesn't show Bugs on its board - pick another type or change the team's bug
   setting."
5. **Tags** (default `brainbox; feedback`), **Priority** (1-4, default 2),
   optional **Assigned to** (email).
6. **Required fields**: any field the type marks always-required and we don't
   fill appears here as a text input for a default value.
7. **Save** runs a `validateOnly` create. A rule error names the field and
   stays on the form. Then "Send a test report" creates a real item and links
   to it.
8. Toggle "Send every new report" (pause), "Stop sending", "Disconnect" - same
   as GitHub.

### The work item

- **Title**: same as GitHub (first line of the end-user's words, 72 chars).
- **Body** (HTML) in ReproSteps for types that have it, else Description:
  inline cropped screenshot, the text, the voice transcript, reporter, page,
  element, host fields, console errors, "Open in Brainbox" and "Session
  replay" links.
- **System Info** (Bug types): browser, viewport, DPR, locale, timezone.
- **Attachments**: cropped and full screenshot as files on the item.
- **Hyperlink** relation to the Brainbox report.
- **Area / Iteration / Tags / Priority / Assigned to** from the destination.

Screenshots are uploaded into ADO, not linked from our public `/f/` URL, so
they stay as private as the ADO project (a difference from GitHub worth
telling customers). The `/f/` link is the fallback if an upload fails.

### When it breaks

| Cause | What ADO returns | What we do |
|---|---|---|
| Refresh token revoked / expired (password reset, user disabled, 90 days idle), PAT expired | `invalid_grant` / 401 / 203 sign-in page | Mark connection **needs reconnect**; banner in Settings; email the Account owner once; each delivery fails "Reconnect Azure DevOps". After reconnect, offer "Retry N failed reports". |
| Connecting user lost access to the project | 403 / TF401019 | Same failure text; suggest a service account. |
| Area / iteration / project renamed or deleted | 400 TF401347 etc. | Delivery fails naming the path; Settings shows the destination as broken and reopens the picker. |
| A required field was added later | 400 TF401320 naming the field | Failure names the field; link to Settings' required-fields step. |
| Throttled | 429 + Retry-After | Failure recorded as retryable; (Phase 2: automatic backoff). |
| Org enforces IP Conditional Access | 401 with CA error | Failure text points to the docs listing our egress IPs. |
| Consent blocked in tenant | AADSTS65001 / "Need admin approval" at sign-in | Callback page explains, with a copyable admin-consent link. |
| MSA-backed org | Sign-in works, org list empty / 401 | Explain and switch to the PAT form. |

## 5. Architecture (fits ADR 0006 as-is)

The tables, dispatch and `Destination` seam already anticipate a second
provider. What's new is that ADO needs **stored, refreshable, encrypted
credentials** (GitHub mints tokens from our app key and stores nothing).

### `packages/integrations` - `src/azure-devops/`

- `client.ts` - `adoRequest()` over injectable `fetch`, `AzureDevopsApiError`,
  error-body parsing (`message`, `typeKey`, TF codes), 203-sign-in detection.
- `workitems.ts` - `azureDevopsWorkItems(options): Destination`, kind
  `"azure-devops"`. Options: `organization`, `project`, `workItemType`,
  `areaPath`, `iteration`, `tags`, `priority?`, `assignedTo?`, `fields?`,
  `bodyField`, `token: TokenSource`, `baseUrl?` (Server), `fetch?`. Uploads
  attachments first, then one create call with every field and relation, so a
  work item is never half-made. `deliver()` never throws.
- `catalog.ts` - `azureDevops({ token })` helpers that throw: organizations,
  projects, teams, team settings (bugs behavior, default/backlog iteration,
  area paths), current iteration, work item types, a type's fields (required
  ones), validate-only create.
- `entra.ts` - `entraApp({ clientId, clientSecret, tenant })`: authorize URL
  (PKCE), code exchange, refresh. `fetch` only, no MSAL.
- `webhook.ts` (Phase 2) - service hook payload parsing and auth check.

`ticket.ts`: split today's renderer into a section model with two outputs,
`renderTicket()` (Markdown, unchanged) and `renderTicketHtml()` (escaped
HTML), so a change to what a ticket says is still made once. Add an optional
`ticket.files` loader (`crop`, `screenshot` → bytes) so a destination can
upload images without fetching our own public URL.

### `packages/shared/src/integrations.ts`

- `IntegrationProvider = "github" | "azure-devops"`.
- `AzureDevopsDestinationConfig` (organization, project id+name, team id+name,
  workItemType, bodyField, areaPath, iteration `{ kind: "backlog" | "current" }
  | { kind: "fixed"; path }`, tags, priority, assignedTo, fields).
- `ProjectDestination` becomes a union discriminated on `provider`, so
  `config` narrows instead of being one shape.
- `IntegrationConnection` gains `status: "active" | "needs_reauth"` and
  `auth: "app" | "oauth" | "pat"`.
- `IntegrationsState` gains `azureDevops: { available: boolean }` (Entra
  configured; the PAT form is always available).
- Catalog response types for the pickers.

### `backend/`

Builds on Teams (branch `t3/add-team-invitations`): connections are owned by
`teamId` and every check goes through `projectAccess()`, not `ownerId`.

- **Schema** (Postgres migration from `db:generate` after rebasing onto Teams
  and triage, never hand-numbered; plus Convex `schema.ts`/validators):
  `integration_connections` gains `credentials` (nullable, sealed) and
  `status`. Postgres `config` jsonb already holds any shape; Convex's
  `destinationConfig` validator becomes a union. Convex functions use
  `serverQuery`/`serverMutation` only.
- **Store methods** take and return plaintext credentials; each store seals on
  write and opens on read with `store/credentials.ts` (done: WebCrypto
  AES-256-GCM, connection id as additional data). Covered by
  `test/*.int.test.ts` for both stores. Credentials never reach the dashboard
  (`toConnection` doesn't serialize them).
- `integrations/azure-devops-tokens.ts` - access token from a connection:
  in-memory cache, single-flight refresh per connection, persists the rotated
  refresh token, flips the connection to `needs_reauth` on `invalid_grant`.
- `integrations/registry.ts` - maps a stored `azure-devops` destination to
  `azureDevopsWorkItems()`; `integrationsConfigured("azure-devops")` (needs
  `INTEGRATIONS_ENCRYPTION_KEY`; Entra sign-in additionally needs
  `AZURE_DEVOPS_CLIENT_*`). Unconfigured routes answer 503, like GitHub.
- Routes, access-checked with `projectAccess()`:
  - `POST /integrations/azure-devops/authorize` → Microsoft URL; the PKCE
    verifier travels inside a sealed `state` (no cookie).
  - `GET /integrations/azure-devops/callback` → exchange, save or refresh the
    connection (externalId = `entra:{tid}:{oid}`), redirect to Settings
    `?azure-devops=connected|error|consent_required`.
  - `POST /integrations/azure-devops/pat` → validate against the org, save
    (externalId = `pat:{org}`).
  - `GET /integrations/azure-devops/connections/:id/{organizations,projects,teams,team,work-item-types,work-item-type}`.
- `routes/projects.ts` - provider enum gains `azure-devops`; per-provider zod
  config; saving computes `bodyField`/`systemInfoField` server-side, runs
  `validateWorkItem()`, and answers 422 with Azure DevOps' rule error;
  `POST .../destinations/:provider/test` sends a sample report.
- `toTicket()` passes `files` loaders from `Storage`, so screenshots are
  uploaded into Azure DevOps instead of linked.
- `dispatch.ts` - a `needs_reauth` connection records the failure without
  calling out; a 401 from Azure DevOps marks the connection `needs_reauth`.
- `env.ts` + `docs/self-hosting.md` in the same change:
  `INTEGRATIONS_ENCRYPTION_KEY` (optional; unset = Azure DevOps answers 503),
  `AZURE_DEVOPS_CLIENT_ID`, `AZURE_DEVOPS_CLIENT_SECRET` (optional; unset =
  PAT only), `AZURE_DEVOPS_TENANT` (default `organizations`); app
  registration steps, redirect URI, permissions, and that Entra client
  secrets expire (24 months max).

### `dashboard/`

- Settings: a **Destinations** list (GitHub, Azure DevOps) instead of one
  GitHub card.
- `AzureDevopsDestination.tsx` - the setup steps above, each picker loading
  from the step before; reconnect banner; PAT form.
- `lib/integrations.ts` - `PROVIDER_NAME["azure-devops"] = "Azure DevOps"`,
  `installResult` per provider, iteration/required-field helpers (tested).
- `IssueDeliveries` - ADO mark, "Azure DevOps #1234" linking to the item.

### `marketing/`

Azure DevOps on the integrations list, with the "no third-party OAuth policy
needed" line.

## 6. Phases

**Phase 0 - spike (1-2 days).** Register the Entra app in a test tenant and
confirm with real calls: org listing (`app.vssps.visualstudio.com` accounts
API) works with an Entra token; `validateOnly` returns rule errors as
expected; attachment `<img>` renders in ReproSteps; behaviour for an MSA org
and a guest user from another tenant. Start **publisher verification** now; it
has lead time.

**Phase 1 - one-way delivery (MVP, ~2 weeks).** Everything in sections 4 and
5 except webhooks: Entra + PAT connect, encrypted credentials, setup with
validation and test send, HTML ticket with attachments, deliveries and
retries, reconnect handling and email, docs, ADR 0008. Done when a report
filed through the widget shows up on a chosen team's board with its
screenshot, and `pnpm verify` is green.

**Phase 2 - close the loop.** Needs a Brainbox issue status first (issues have
none today; ADR 0006). Then: service hook subscription created at setup when
the user has rights (else manual instructions), `workitem.updated` →
issue resolved when the item reaches a Done/Closed/Resolved *state category*;
"notify the reporter" email when the host passed an email; Brainbox comments
→ ADO comments; automatic retry with backoff for 429/5xx.

**Phase 3 - enterprise.** Service principal connections (bot identity);
Azure DevOps Server with a custom base URL; routing rules (page URL or host
field → different team/area); per-report "Send to Azure DevOps" with
overrides; link a report to an existing work item.

## 7. Tests (with the change, per `AGENTS.md`)

- Integrations: request shape (JSON Patch ops, content type, URL encoding of
  org/project/type), Bug → ReproSteps + SystemInfo vs. Description, HTML
  escaping of every user string, attachment upload before create and
  relations in the patch, fallback to public links on upload failure, error
  mapping (401, 203, 403, 400 TF codes, 429), current-sprint resolution,
  Entra exchange/refresh. All on `fakeFetch`.
- Backend: callback state/ownership/forgery, PAT validation, credentials
  encrypted at rest and absent from responses, single-flight refresh and
  `needs_reauth`, validate-on-save 422, dispatch skipping a broken connection;
  store suite for both drivers.
- Dashboard: `deliveryLabel` for ADO, setup helpers.

## 8. How we'll know it works

- Setup completion: started → first work item delivered, target > 70%.
- Time from "Connect" to first item, target < 5 minutes.
- Delivery success rate > 99% excluding `needs_reauth`.
- Connections in `needs_reauth` and how long they stay there.
- Share of new projects choosing ADO vs. GitHub.

## 9. Decisions needed from you

1. **Who registers the Entra app and does publisher verification** (needs a
   Microsoft Partner Network ID). Without it many company tenants will need an
   admin to approve Brainbox. Recommended: start this week; it gates launch,
   not code.
2. **Plan gating.** Recommended: one-way delivery on every paid plan (it's
   table stakes); two-way sync on Business.
3. **Phase 2 ordering.** Two-way sync depends on Brainbox issue status, which
   is its own feature. Recommended: ship Phase 1, then build issue status for
   all providers, then ADO sync.

## Sources

- Microsoft Learn: Entra OAuth for Azure DevOps; Azure DevOps OAuth
  (deprecated, no new registrations since April 2025); application access
  policies; PAT policies; work items create API; service hooks.
- Azure DevOps blog: Markdown for work items (July 2025); global PAT
  retirement (December 2025).
- Jam, Marker.io and Sentry Azure DevOps docs.
