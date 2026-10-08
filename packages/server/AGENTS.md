# server - AGENTS.md

The receiving end of the wire format (`@brainbox/server`). Web-standard
`Request` in, typed result out, `zod` as its only dependency. Root rules in
`/AGENTS.md` apply; ADR 0005 explains why this is its own package.

## What this package is

`parseIngest(request, limits)` reads a widget upload: the multipart body, the
`json` part validated against `@brainbox/shared`'s `FeedbackPayload`, and each
file part's type and size. It returns the payload and files, or a status and
error body ready to send back. What happens next (which project the key
belongs to, where files go, which database row is written) is the host's
business. `backend/` is one host.

`README.md` here is the written-down wire format. Keep it in step with
`schema.ts`; the compile-time drift guards there keep `schema.ts` in step with
`@brainbox/shared`.

## Rules that are specific here

- No framework and no I/O. Nothing from Hono, Drizzle or Node's `fs`. If a
  change needs one of those, it belongs in `backend/`.
- Errors are data, not throws: `{ ok: false, status, body }`. A host turns
  them into a response in one line.

## Tests

Vitest under Node. Build a `Request` with `FormData` and assert each path.
`backend/test/ingest.int.test.ts` covers the route end to end against
Postgres. Run: `pnpm -F @brainbox/server test`.
