# widget - AGENTS.md

Brainbox's own capture UI (`@brainbox/widget`). React, built on
`@brainbox/core` (the engine) and `@brainbox/react` (the provider and hooks).
Root rules in `/AGENTS.md` apply.

## Three ways in, one UI

- `src/embed.ts` is the script-tag bundle (`widget.js`). It reads the
  `data-*` attributes, calls `mount()`, and publishes `window.Brainbox`. It is
  the only file here that runs on load.
- `mount()` (`src/mount.tsx`) is for a host with no React tree: creates the
  instance, renders the widget, returns `{ open, close, identify, destroy }`.
- `<BrainboxWidget />` and `useBrainboxWidget()` are for a host's own React
  tree, under a `<BrainboxProvider>`.

All three render `src/App.tsx`, which holds a core `Draft` and shows screens
off its state. Whether the UI is open lives in `src/lib/widget-store.ts`, one
store per instance, so a host button and the widget agree without a second
provider. Core has no idea of "open".

## What makes the widget different

It runs inside a **host app you don't control**, so isolation is the whole game:

- The UI mounts in a **Shadow DOM** (`src/lib/shadow-host.ts`) so host CSS
  can't bleed in and widget CSS can't leak out. Don't reach into `document`
  for styling or assume global styles; keep everything scoped to the shadow
  root. `<BrainboxWidget />` appends the host to `<body>` wherever it sits in
  the host's tree, so no ancestor's `overflow` or `transform` can trap it.
- The engine is not here. Screenshots, marks, recording, metadata and sending
  live in `@brainbox/core`. If a change is about *what gets captured or sent*,
  it belongs in `packages/core`. If it is about *what the user sees*, it
  belongs here.
- Keep the UI-side browser logic in `src/lib/*` (`config`, `position`,
  `shadow-css`, `shadow-host`, `widget-store`, `time`, `multiband`, the
  drawing hooks) as small pure functions with a colocated `*.test.ts`.

## Build

`pnpm build` emits two things from one source: `dist/widget.js`, the
self-contained IIFE with React bundled, and `dist/index.js`, an ES module of
the library entry with React and the other `@brainbox/*` packages external.
Inside the monorepo the package is consumed from source (`src/index.ts`).

## Tests

Vitest under jsdom. `lib/*` functions are tested directly. `widget.test.tsx`,
`mount.test.tsx` and `embed.test.ts` render the real tree with
`react-dom/client` inside `act()` and read the shadow root. `!` is allowed in
`*.test.ts(x)`. Run: `pnpm -F @brainbox/widget test`.
