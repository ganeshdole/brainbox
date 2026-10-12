# 7. Pluggable stores, file storage and runtimes

Date: 2026-10-12

## Status

Accepted. Amends ADR 0002: Postgres, R2 and a long-running Node process stay
the defaults, but they are now one choice each among several.

## Context

ADR 0002 chose an owned, portable stack so Brainbox could move between boxes.
It still assumed one database, one blob store and one kind of host. The first
self-hosting customer, HapiVet, runs on Azure Functions and keeps its data on
Convex, and other self-hosters will bring their own platforms.

Three couplings stood in the way:

| Coupling | Where | What it blocked |
|---|---|---|
| Routes, auth, billing and delivery called Drizzle directly | `src/routes/*`, `lib/billing.ts`, `auth/config.ts` | Any database but Postgres |
| Background work ran as a bare `void promise` | `routes/ingest.ts` | Hosts that freeze an instance once it responds |
| The only entry was a Node server | `src/index.ts` | Serverless hosts |

## Decision

Each concern gets one small interface, a few implementations, and a setting
that picks one:

| Concern | Interface | Implementations | Setting |
|---|---|---|---|
| Data | `Store` (`src/store/types.ts`) | Postgres, Convex | `DATABASE_DRIVER` |
| Uploaded files | `Storage` (`src/storage/index.ts`) | local disk, R2, Convex | `STORAGE_DRIVER` |
| Host | a thin entry around the Hono app | Node server, Azure Functions | which entry runs |

### Rules

1. The integration suite is the contract. Tests seed through the `Store` and
   inspect through `test/harness.ts`, never through one database's client, and
   every store must pass all of it (`TEST_STORE=convex` for Convex).
2. A rule every store must apply the same way, such as ignoring a stale
   subscription event, is a plain function the stores share
   (`store/subscription-write.ts`), not logic copied into each.
3. A store without foreign keys does the cascades itself, inside the same
   transaction as the delete.
4. Work that outlives a response goes through `runInBackground()`. Serverless
   entries wait for it before returning.
5. A store reached over the network is locked to the backend. Convex functions
   are public by default, so each one requires `BRAINBOX_SERVER_SECRET`.

## Consequences

- Adding a database or host is an implementation plus a passing suite, not a
  change to routes.
- A schema change now lands in each store: `src/db/schema/` and
  `convex/schema.ts`.
- On Azure Functions the ingest response waits for transcription and ticket
  delivery, a few seconds at most, rather than risk losing them. A queue
  trigger is the upgrade if that wait ever matters.
- Convex file URLs are unguessable but never expire, unlike R2's hour-long
  presigned URLs.
- Each Convex store call is an HTTP round trip, where Postgres is a pooled
  connection. Routes make two or three calls, which is fine at feedback volume.
