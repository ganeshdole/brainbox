# core - AGENTS.md

The capture engine (`@brainbox/core`). Plain TypeScript, no React, no UI. Root
rules in `/AGENTS.md` apply; ADR 0005 explains why this package exists.

## What this package is

Everything about a feedback report that is not a screen: rasterising the page,
baking marks into the shot, recording a session, buffering console errors, and
handing the finished parts to a `Transport`. `widget/` is one UI on top of it;
a host app with its own UI is another.

## Rules that are specific here

- No `react` in `package.json`, ever. pnpm's strict `node_modules` makes a
  stray import a build error, which is the point.
- No module-level state. Everything hangs off `createBrainbox()`, and
  `destroy()` undoes everything the instance set up. The one exception is the
  shared `console.error` hook in `metadata.ts`, which is installed when the
  first instance asks and removed when the last one goes away.
- Importing this package does nothing. Only a call has effects.
- `Draft` owns the report in progress. Anything a UI would have to get right
  about timing (a late screenshot, a bake still in flight, a cancelled run)
  belongs in `draft.ts`, not in a component.

## Tests

Vitest under jsdom, colocated `*.test.ts`. jsdom has no canvas, screenshotting
or `URL.createObjectURL`, so `draft.test.ts` mocks `capture.ts` and stubs the
URL functions. Run: `pnpm -F @brainbox/core test`.
