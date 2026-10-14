# widget - AGENTS.md

Brainbox's own capture UI (`@ganeshdole/brainbox-widget`). React, built on
`@ganeshdole/brainbox-core` (the engine) and `@ganeshdole/brainbox-react` (the provider and hooks).
Root rules in `/AGENTS.md` apply.

## Three ways in, one UI

- `src/embed.ts` is the script-tag bundle (`widget.js`). It reads the
  `data-*` attributes, calls `mount()`, and publishes `window.Brainbox`. It is
  the only file here that runs on load.
- `mount()` (`src/mount.tsx`) is for a host with no React tree: creates the
  instance, renders the widget, returns `{ open, start, close, identify, destroy }`.
- `<BrainboxWidget />` and `useBrainboxWidget()` are for a host's own React
  tree, under a `<BrainboxProvider>`.

All three render `src/App.tsx` (through `src/widget-ui.tsx`, the lazily
loaded chunk that also carries the stylesheet), which holds a core `Draft` and
shows screens off its state. Whether the UI is open lives in `src/lib/widget-store.ts`, one
store per instance, so a host button and the widget agree without a second
provider. Core has no idea of "open".

## The screens are public API

Besides the main entry, `src/ui.ts` (`./ui`) exports every screen and
`src/markup.ts` (`./markup`) the markup step on its own. Hosts compose them
or swap one into our flow through `components` (`src/slots.ts`). So:

- A screen is controlled. It takes props and calls callbacks, and never reads
  `widget-store`, a `Brainbox` or a `Draft`; that wiring lives in `App.tsx`
  (or `DraftMarkup`, the one binding to a draft). Its props interface
  (`ComposerProps`, ...) is exported and documented field by field, and
  changing it is a breaking change for 0.x hosts. Add optional props rather
  than changing existing ones.
- A new step in the flow gets a slot in `WidgetComponents`, read in `App.tsx`
  as `components.X ?? builtIn.X`, and a slot test in `slots.test.tsx`.
- `src/index.ts` must stay small: it may only `export type` from the screens.
  A runtime import from `components/` there pulls the whole UI into every
  host's first load. Check `dist/index.js` after `pnpm build`.
- `widgetCss` (`lib/stylesheet.ts`) stays `/* @__PURE__ */`, so a host that
  imports a screen without our styles doesn't ship 40 KB of CSS.

## What makes the widget different

It runs inside a **host app you don't control**, so isolation is the whole game:

- The UI mounts in a **Shadow DOM** (`src/lib/shadow-host.ts`) so host CSS
  can't bleed in and widget CSS can't leak out. Don't reach into `document`
  for styling or assume global styles; keep everything scoped to the shadow
  root. `<BrainboxWidget />` appends the host to `<body>` wherever it sits in
  the host's tree, so no ancestor's `overflow` or `transform` can trap it.
- Pointer and click events stop at the shadow host (`ISOLATED_EVENTS` in
  `shadow-host.ts`), so a host that closes its menus on an outside click keeps
  them open while the user reports them. Keys are not isolated: the widget's
  own shortcuts listen on `window`. Keep that split when adding listeners.
- The engine is not here. Screenshots, marks, recording, metadata and sending
  live in `@ganeshdole/brainbox-core`. If a change is about *what gets captured or sent*,
  it belongs in `packages/core`. If it is about *what the user sees*, it
  belongs here.
- Keep the UI-side browser logic in `src/lib/*` (`config`, `position`,
  `shadow-css`, `shadow-host`, `widget-store`, `time`, `multiband`, the
  drawing hooks) as small pure functions with a colocated `*.test.ts`.

## Build

`pnpm build` emits three things from one source: `dist/widget.js`, the
IIFE with React bundled; `dist/widget-capture.js`, rrweb and modern-screenshot
as a second IIFE that `widget.js` injects on first open (`embed.ts` passes
`siblingScriptLoader` from `src/lib/load-capture.ts` to core as its `loader`,
and the IIFE build marks rrweb and modern-screenshot external so core's
default `import()`s don't pull them in);
and `dist/index.js`, `dist/ui.js` and `dist/markup.js`, one ES build of
the three library entries sharing their chunks (the lazy `widget-ui-*.js`
among them), with React and the other `@ganeshdole/brainbox-*` packages
external.
Inside the monorepo the package is consumed from source (`src/index.ts`).

## Tests

Vitest under jsdom. `lib/*` functions are tested directly. `widget.test.tsx`,
`mount.test.tsx` and `embed.test.ts` render the real tree with
`react-dom/client` inside `act()` and read the shadow root. `!` is allowed in
`*.test.ts(x)`. `ui.test.tsx`, `slots.test.tsx` and `markup.test.tsx` cover
the public screens, one test per `components` slot, and the standalone
markup. `compose.html` is the dev page for those (`pnpm dev`, then
`/compose.html`). Run: `pnpm -F @ganeshdole/brainbox-widget test`.
