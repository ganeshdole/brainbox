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

Six surfaces, one workspace package each:

- `packages/core/` - the capture engine (`@brainbox/core`). Plain TypeScript, no
  React: screenshots, marks, session recording, console-error capture, and the
  `Transport` that sends a report. Everything else that captures feedback is a
  UI on top of it (ADR 0005).
- `widget/` - the embeddable capture UI (`@brainbox/widget`). React, shipped as an
  IIFE script-tag bundle, isolated from the host page via Shadow DOM.
- `dashboard/` - the customer-facing SaaS (`@brainbox/dashboard`). React + Vite +
  React Router.
- `backend/` - the API (`@brainbox/backend`). Hono + Drizzle + Postgres.
- `marketing/` - the landing page (`brainbox-landing`). React + Vite.
- `packages/shared/` - cross-surface types (`@brainbox/shared`). Pure types, no
  runtime.

Package-specific rules live in nested `AGENTS.md` files. Read the one for the
surface you're editing.

## The one rule: verify before you claim done

`pnpm verify` runs lint → typecheck → test → build across every package. It must
pass before a change is finished. Do not report a task complete on a red
`verify`. While iterating, scope to one package - e.g. `pnpm -F @brainbox/backend
test` - but the full `verify` is the gate.

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
