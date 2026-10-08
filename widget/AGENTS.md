# widget - AGENTS.md

The embeddable capture UI (`@brainbox/widget`). React, built as an IIFE
script-tag bundle that runs inside the customer's page. Root rules in `/AGENTS.md`
apply.

## What makes the widget different

It runs inside a **host app you don't control**, so isolation is the whole game:

- The UI mounts in a **Shadow DOM** so host CSS can't bleed in and widget CSS
  can't leak out. Don't reach into `document` for styling or assume global
  styles; keep everything scoped to the shadow root.
- `src/embed.ts` is the IIFE entry (the script-tag bundle). `src/App.tsx` is the
  React surface. The capture flow (open → mark up → compose → submit) is defined
  in `CONTEXT.md`.
- The engine is not here. Screenshots, marks, recording, metadata and sending
  live in `@brainbox/core`; `App.tsx` holds a core `Draft` and renders screens
  off its state. If a change is about *what gets captured or sent*, it belongs
  in `packages/core`. If it is about *what the user sees*, it belongs here.
- Keep the UI-side browser logic that remains in `src/lib/*` (`config`,
  `position`, `shadow-css`, `time`, `multiband`, the drawing hooks) as small
  pure functions with a colocated `*.test.ts`.

## Tests

Vitest under jsdom. Test the `lib/*` functions directly rather than driving the
React tree. `!` is allowed in `*.test.ts`. Run: `pnpm -F @brainbox/widget test`.
