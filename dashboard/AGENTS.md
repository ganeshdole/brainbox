# dashboard - AGENTS.md

The customer-facing SaaS (`@brainbox/dashboard`). React + Vite + React Router.
Root rules in `/AGENTS.md` apply.

## Structure

- `src/pages/*` are route screens; `src/components/*` are shared UI (`ui/` is the
  primitive layer). `src/App.tsx` wires the router.
- All backend calls go through the typed client in `src/lib/api.ts` - add a
  method there rather than calling `fetch` from a component. It handles the 401 →
  `/login` redirect and error unwrapping centrally.
- API base URL comes from `src/lib/authConfig.ts`. Auth is a session cookie sent
  with `credentials: "include"`; there's no token to thread through the UI.

## The replay player is not here

Session playback is `<SessionReplay />` from `@brainbox/replay`, themed through
the `.bb-replay` block in `src/index.css`. Changes to how a recording plays go
in `packages/replay`; `IssueDetailPane` only places it.

## Types are shared

Issue/Project shapes come from `@brainbox/shared`, the same types the backend
uses. Import from there instead of redeclaring - if the API shape changes, change
it in `packages/shared` and let both ends fail to compile.

## Tests

Vitest under jsdom. Pure logic in `src/lib/*` (e.g. `normalizeOrigin`, `timeAgo`)
is tested directly - see `src/lib/utils.test.ts`. Prefer extracting logic into
`lib/` and testing it over rendering whole route trees. Run:
`pnpm -F @brainbox/dashboard test`.
