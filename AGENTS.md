# AGENTS.md

Operational guide for coding agents working in the brainbox monorepo. These are
instructions, not documentation - assume you already know what a monorepo, an
`src/` folder, and TypeScript are. This file loads every session, so every line
has to earn its place.

## What this repo is

Brainbox is an embeddable in-app feedback widget plus the SaaS around it. The
domain vocabulary (Customer vs End-user, Host app, Capture flow, Project key, the
Account → Project → Issue hierarchy) lives in `CONTEXT.md`. Read it before
touching product logic - it is canon, describing how the system is meant to work.

Ten surfaces, one workspace package each:

- `packages/core/` - the capture engine (`@ganeshdole/brainbox-core`). Plain TypeScript, no
  React: screenshots, marks, session recording, console-error capture, and the
  `Transport` that sends a report. Everything else that captures feedback is a
  UI on top of it (ADR 0005).
- `packages/react/` - React bindings (`@ganeshdole/brainbox-react`): `<BrainboxProvider>`
  owns one instance, `useBrainbox()` and `useDraft()` read it. No UI.
- `widget/` - the embeddable capture UI (`@ganeshdole/brainbox-widget`). React, shipped as an
  IIFE script-tag bundle, isolated from the host page via Shadow DOM.
- `packages/replay/` - the session player (`@ganeshdole/brainbox-replay`): `<SessionReplay />`
  over `@rrweb/replay`, with its own plain stylesheet. The dashboard is one host.
- `dashboard/` - the customer-facing SaaS (`@ganeshdole/brainbox-dashboard`). React + Vite +
  React Router.
- `packages/server/` - the receiving end of the wire format (`@ganeshdole/brainbox-server`):
  `parseIngest(request, limits)` over a web-standard `Request`, zod only. Its
  README is the written-down upload format.
- `packages/integrations/` - where a report goes next (`@ganeshdole/brainbox-integrations`):
  the `Destination` interface, `renderTicket()` / `renderTicketHtml()`,
  `githubIssues()` plus the GitHub App helpers, and `azureDevopsWorkItems()`
  plus the Azure DevOps catalog and Entra sign-in helpers. `fetch` and WebCrypto only. The backend decides which
  project has which destination and when to deliver.
- `backend/` - the API (`@ganeshdole/brainbox-backend`). Hono over a pluggable
  store (Postgres or Convex) and file storage (local, R2 or Convex), runnable as
  a Node server or on Azure Functions. Uses `@ganeshdole/brainbox-server` for
  `/ingest` and `@ganeshdole/brainbox-integrations` to deliver.
- `marketing/` - the landing page (`brainbox-landing`). React + Vite.
- `packages/shared/` - cross-surface types (`@ganeshdole/brainbox-shared`). Pure types, no
  runtime.

Package-specific rules live in nested `AGENTS.md` files. Read the one for the
surface you're editing.

## The one rule: verify before you claim done

`pnpm verify` runs lint → typecheck → test → build across every package. It must
pass before a change is finished. Do not report a task complete on a red
`verify`. While iterating, scope to one package - e.g. `pnpm -F @ganeshdole/brainbox-backend
test` - but the full `verify` is the gate.

## Browser tests

`e2e/` drives the real backend and dashboard in Chromium over Postgres
(`brainbox_e2e_<checkout folder>`, dropped and recreated every run by
`backend/scripts/reset-e2e-db.ts`), and records a video of every person a test
signs in into `e2e/test-results/`. A test that needs data the UI can't create
seeds it after the reset (`backend/scripts/seed-e2e-*.ts`). It is not part of
`verify`. Run it with `pnpm -F @ganeshdole/brainbox-e2e e2e` (once per machine: `pnpm -F @ganeshdole/brainbox-e2e exec playwright install
chromium`); `SLOW_MO=500` slows it down enough to follow the video.

## Publishing

Packages publish as `@ganeshdole/brainbox-*`: `brainbox` on npm is someone else's user
account. `pnpm release` runs `verify`, then publishes every package that is not
`private: true` to npm: `@ganeshdole/brainbox-shared`, `core`, `react` and `widget`, in
lockstep (`workspace:*` becomes the exact version). The `private` flag is the
fence; the backend, dashboard, marketing, server, replay and integrations
packages keep it.

## Two strict-mode facts the linter won't tell you up front

`pnpm verify` enforces the mechanical rules (no `any`, no source `!`, etc.), so
this doesn't restate them - it just calls out two things you can't infer and that
change how you write:

- `noUncheckedIndexedAccess` is on: any array/index access is `T | undefined`.
  Handle the undefined case instead of asserting past it.
- Non-null `!` is banned in source but allowed in test files (you own the
  fixture there). In source, guard and return early.

## Tests come with the change

Every package with runtime logic has tests that run under `pnpm verify`. When you
add or change behavior, add or update the test in the same change - a feature
without a test is not done. `packages/shared` is pure types; its contract is
`typecheck`, so it has no runtime tests by design.

## Canon vs. not

- **Canon** (trust as current truth): this file, nested `AGENTS.md`, `CONTEXT.md`,
  `docs/self-hosting.md` (the deployment options and their settings; keep it in
  step with `backend/src/env.ts`), and code comments/docstrings.
- **Not canon** (intent or history, may be stale): `docs/adr/*` records *why* past
  decisions were made, not necessarily the current state; commit messages and any
  plan describe intent. Never treat a plan as a description of what exists - read
  the code for that.
