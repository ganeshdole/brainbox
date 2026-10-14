# 10. A backend built from parts

Date: 2026-10-14

## Status

Accepted. Builds on ADR 0007 (pluggable stores and runtimes) and applies ADR
0005's rule of no module-level state to the backend.

## Context

ADR 0007 made the database, file store and host a choice each, but the
backend was still one fixed program: `app.ts` built a module-level app from
the environment, and storage, email, transcription and the GitHub App were
singletons chosen by env vars. A self-hoster could pick a shipped driver or
swap one in with `setStore()` before serving, and nothing else.

Two things made bringing your own database expensive:

- `Store` was one interface of about fifty methods: projects and issues, but
  also Teams, triage, features, integrations, billing, webhooks, the waitlist
  and Auth.js. Receiving reports in MongoDB meant writing all of it.
- Nothing could prove a store behaved like Postgres short of running the
  whole HTTP suite against it, which needs this repo's test setup.

## Decision

**`createApp(deps)`** builds the Hono app from what it is given: a store, a
file store and settings, plus optionally an emailer, a transcriber, tracker
settings, sign-in and billing. Every part reaches routes through the request
context (`c.get("deps")`), never through a module, so two apps in one process
share nothing. `fromEnv()` is the one place that reads `src/env.ts` and turns
it into deps; `src/app.ts` is `createApp(fromEnv())`, and the Node and Azure
entries are unchanged. ESLint forbids importing the env or a `get*()`
singleton anywhere on the factory path.

**`Store` is a core and modules.** The core is `projects` and `issues`:
enough to receive a report and read it back. Everything else is an optional
module with its own interface: `auth`, `teams`, `triage`, `features`,
`integrations`, `billing`, `waitlist`. Each is all or nothing. The app mounts
a module's routes only when the store has it, and `GET /api/me` tells the
dashboard which ones to show. The webhook writes moved into the modules they
change (billing, integrations) rather than being a module of their own.

Some combinations need rules:

- No `auth` (or no `auth` setting): no dashboard API at all. The app still
  receives reports, serves file links and runs webhooks.
- No `teams`: everyone who signs in owns one implicit Team and sees every
  project. That is only safe for a known set of people, so `createApp`
  refuses unless sign-in is limited to email domains.
- `billing` needs both the store module and Dodo settings; without either
  there is no paywall.

**`Transcriber`** is an interface with one method; the Groq and OpenAI
providers are factories over the AI SDK. No transcriber, no transcripts.

## Consequences

- A custom backend is an entry file: build a store, call `createApp`, serve.
  A store can start as the core and grow modules.
- `setStore()`, `setStorage()` and `setEmailer()` keep working for the
  env-built app, but are deprecated.
- Behaviour on an env-configured deployment is unchanged, with one fix: sign-in
  now works without `AUTH_URL`, mounted at `/api/auth`.
- Auth.js still reads `AUTH_URL` from the runtime's environment itself; it is
  the one setting not passed through `createApp`.
- A route for a module must not assume the module exists elsewhere. Code
  shared between modules checks for it.
