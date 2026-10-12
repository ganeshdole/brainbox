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

- `packages/core/` - the capture engine (`@brainbox-sh/core`). Plain TypeScript, no
  React: screenshots, marks, session recording, console-error capture, and the
  `Transport` that sends a report. Everything else that captures feedback is a
  UI on top of it (ADR 0005).
- `packages/react/` - React bindings (`@brainbox-sh/react`): `<BrainboxProvider>`
  owns one instance, `useBrainbox()` and `useDraft()` read it. No UI.
- `widget/` - the embeddable capture UI (`@brainbox-sh/widget`). React, shipped as an
  IIFE script-tag bundle, isolated from the host page via Shadow DOM.
- `packages/replay/` - the session player (`@brainbox-sh/replay`): `<SessionReplay />`
  over `@rrweb/replay`, with its own plain stylesheet. The dashboard is one host.
- `dashboard/` - the customer-facing SaaS (`@brainbox-sh/dashboard`). React + Vite +
  React Router.
- `packages/server/` - the receiving end of the wire format (`@brainbox-sh/server`):
  `parseIngest(request, limits)` over a web-standard `Request`, zod only. Its
  README is the written-down upload format.
- `packages/integrations/` - where a report goes next (`@brainbox-sh/integrations`):
  the `Destination` interface, `renderTicket()`, and `githubIssues()` plus the
  GitHub App helpers. `fetch` and WebCrypto only. The backend decides which
  project has which destination and when to deliver.
- `backend/` - the API (`@brainbox-sh/backend`). Hono + Drizzle + Postgres. Uses
  `@brainbox-sh/server` for `/ingest` and `@brainbox-sh/integrations` to deliver.
- `marketing/` - the landing page (`brainbox-landing`). React + Vite.
- `packages/shared/` - cross-surface types (`@brainbox-sh/shared`). Pure types, no
  runtime.

Package-specific rules live in nested `AGENTS.md` files. Read the one for the
surface you're editing.

## The one rule: verify before you claim done

`pnpm verify` runs lint → typecheck → test → build across every package. It must
pass before a change is finished. Do not report a task complete on a red
`verify`. While iterating, scope to one package - e.g. `pnpm -F @brainbox-sh/backend
test` - but the full `verify` is the gate.

## Publishing

The npm scope is `@brainbox-sh` because `brainbox` on npm is someone else's user
account. `pnpm release` runs `verify`, then publishes every package that is not
`private: true` to npm: `@brainbox-sh/shared`, `core`, `react` and `widget`, in
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
  and code comments/docstrings.
- **Not canon** (intent or history, may be stale): `docs/adr/*` records *why* past
  decisions were made, not necessarily the current state; commit messages and any
  plan describe intent. Never treat a plan as a description of what exists - read
  the code for that.
