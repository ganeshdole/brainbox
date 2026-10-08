# 5. libbrainbox: an engine with no UI, React bindings on top, thin shells

Date: 2026-10-08

## Status

Accepted. Supersedes the npm phase of ADR 0003: the npm package is no longer a
second entry into `widget/`, it is a stack of smaller packages that `widget/`
itself is built on. The plan below is the order the work landed in; the code
and the nested `AGENTS.md` files are canon for what exists.

## Context

Brainbox was built as one product, so its pieces are welded together. Another
product can embed `widget.js` and point `data-endpoint` somewhere else, and
that is the whole integration story. In the code:

| Coupling | Where | What it blocks |
|---|---|---|
| The capture engine lives inside a React component | `widget/src/App.tsx` (`runRef`, `shotRef`, `recRef`, `onSubmit`) | Capturing without our UI |
| Module-level state | `lib/metadata.ts` (`consoleErrors`, `identity`), `lib/annotate.ts` (`live`) | A second instance, cleanup, tests that don't leak into each other |
| Importing runs code | `widget/src/embed.ts` reads `document.currentScript`, sets `window.Brainbox`, mounts on load | Importing from a bundler; rendering on a server |
| Parts talk through window events | `brainbox:open`, `brainbox:close`, `brainbox:submitted` | Plain method calls; more than one widget per page |
| Sending is hard-wired | `lib/submit.ts` calls `fetch(endpoint)` | Auth headers, extra fields, any other destination |
| Upload parsing is mixed into SaaS logic | `backend/src/routes/ingest.ts` parses, looks up the `pk_`, stores, inserts, transcribes | Accepting the format without our database |
| The replay player lives in one app | `dashboard/src/components/SessionReplay.tsx` | Viewing a report anywhere else |

The model is libghostty: the engine does not know which app hosts it, and the
product's own apps are its first consumers. The package shape is the one Redux
uses. `redux` is plain JS, `react-redux` is a thin layer on it, and the app's
components sit on top of both.

## Decision

Split the widget into three packages, with dependencies pointing down only:

```
widget.js (script tag)      a host app's own React tree
        │                              │
        └──── @brainbox/widget ────────┤   our UI: <BrainboxWidget />, mount()
                      │                │
               @brainbox/react  ◄──────┘   <BrainboxProvider>, useBrainbox()
                      │
               @brainbox/core              createBrainbox(): the engine, no React
                      │
               @brainbox/shared            wire types (unchanged)
```

Later, on the other side of the wire, `@brainbox/server` (parse and validate an
upload) and `@brainbox/replay` (play a session back). The backend and dashboard
become consumers of those.

### Rules

1. Dependencies point down, and `package.json` is the fence. `@brainbox/core`
   does not list `react`; `@brainbox/server` does not list `drizzle-orm`. pnpm's
   strict `node_modules` turns a wrong import into a build error.
2. No module-level state. Everything hangs off an instance from
   `createBrainbox()`, and `destroy()` undoes everything the instance set up,
   including the `console.error` patch and the window listeners.
3. Importing a package does nothing. Only a call has effects. `embed.ts` is the
   one file allowed to run on load, because that is what a script tag is for.
4. Each seam is one small interface. On the client that is `Transport`; on the
   server it is the hooks around the parsed upload.
5. Our own apps use only the public API. If `widget/` needs an import from
   `core/src/...` that `core` does not export, the boundary is in the wrong
   place. Fix the boundary, not the import.

### What core owns and what the UI owns

Core owns the report being built. That is everything in `App.tsx` that is hard
to get right and that every UI would get wrong again:

- the screenshot that is still rendering when the composer opens
- baking marks into it in the background, and sending the baked one
- the session recording, the mic, and the marks drawn into the host page
  during a recording
- dropping results from a run the user cancelled (`runRef`)
- building `CapturedMetadata` and handing the parts to a `Transport`

The UI owns which screen is showing (chooser, markup, composer, result) and
how it looks. Core never reaches into a shadow root; the UI passes core the
element to hide during capture.

### API sketch

Names get settled in the first PR. The shape is the point.

```ts
// @brainbox/core
const bb = createBrainbox({ transport, identity });

const draft = bb.draft();                 // one report in progress
draft.subscribe(onChange);                // for useSyncExternalStore
draft.captureScreenshot({ exclude: el }); // starts rasterising now
draft.markUp(marks);                      // region + bake, in the background
const rec = draft.startRecording();       // rrweb + mic; rec.stop(), rec.annotate.show(mark)
await draft.submit({ text, audio });      // waits for the bake, then transport.send()
draft.cancel();                           // late results are dropped, URLs revoked
bb.destroy();

// Transport: where a report goes. Core does not know about project keys.
interface Transport {
  send(report: Report): Promise<{ id: string }>;
}
brainboxTransport({ endpoint, projectKey }); // today's multipart POST to /ingest
```

```tsx
// @brainbox/react
<BrainboxProvider transport={t} identity={user}>
  <App />
  <BrainboxWidget />            {/* from @brainbox/widget, optional */}
</BrainboxProvider>

const bb = useBrainbox();       // the instance
const state = useDraft(draft);  // its state, re-rendered on change
```

```tsx
// @brainbox/widget: our UI, same package as today
<BrainboxWidget position="bottom-right" />          // in a React tree
useBrainboxWidget().open();                         // from the host's own button
mount({ transport, position, trigger: "manual" });  // no React in the host
```

`widget.js` stays. It becomes a short file that reads the `data-*` attributes,
calls `mount()`, and keeps `window.Brainbox` and the `brainbox:*` window events
so existing installs and the marketing demo keep working.

## Plan

Four PRs on the client side, then two more for the server and the player. Each
PR leaves `pnpm verify` green and changes no behaviour for a page that loads
`widget.js` today. Tests move with their modules.

### PR 1: `@brainbox/core`

New package `packages/core`. Browser-only, no React, consumed from source like
`@brainbox/shared` is today.

Moves from `widget/src/lib/`, with their tests:

| File | Goes to | Change |
|---|---|---|
| `capture.ts` | core | `hostEl` becomes an `exclude` option |
| `marks.ts` | core | none; `Mark` is part of the public API |
| `selector.ts` | core | none |
| `session.ts`, `audio.ts` | core | none |
| `annotate.ts` | core | `live` moves onto the recording handle |
| `metadata.ts` | core | `consoleErrors` and `identity` move onto the instance; `installCapture` returns an uninstall |
| `submit.ts` | core | becomes `brainboxTransport()`; the `brainbox:submitted` event moves to `embed.ts` |

Stays in `widget/`: `config.ts` (script-tag parsing), `position.ts`,
`shadow-css.ts`, `time.ts`, `multiband.ts`, `use-drawing.ts`,
`use-multiband.ts`, and every component.

New in core: `createBrainbox()`, `Draft`, `Transport`. `App.tsx` shrinks to
screens plus calls into a `Draft`. The `submit.ts` `video` branch has no caller
in the widget and is dropped.

Tests. Core keeps the jsdom unit tests it inherits and adds: a draft submits
the baked screenshot when `markUp()` is still in flight; `cancel()` drops a
late screenshot; `destroy()` restores `console.error`; two instances do not
share error buffers.

Done when `widget.js` behaves as before in `widget/index.html` and no file
under `widget/src` imports `modern-screenshot` or `rrweb`.

### PR 2: `@brainbox/react`

New package `packages/react`. `react` is a peer dependency.

- `<BrainboxProvider transport identity>` creates the instance in an effect
  and destroys it in the cleanup, so StrictMode's double mount leaves one
  instance. Renders nothing on the server.
- `useBrainbox()` returns the instance; `useDraft(draft)` wraps `subscribe`
  with `useSyncExternalStore`.

`App.tsx` switches from its own `useState`/`useRef` mirror of the draft to
`useDraft()`. No other change.

Tests. Provider mounts and unmounts under StrictMode and leaves zero live
instances; `useDraft` re-renders on a state change.

### PR 3: `@brainbox/widget` as a library

`widget/` keeps its name and becomes a consumer of react and core.

- Export `<BrainboxWidget />`. It renders a host div, attaches the shadow
  root, injects the CSS, and portals the existing components into it
  (ADR 0001 unchanged).
- Export `useBrainboxWidget()` for `open()` and `close()` from a host button.
  The open/close signal lives in this package, not in core; core has no idea
  of "open".
- Export `mount(options)` for hosts without React. It creates a React root
  and returns `{ open, close, identify, destroy }`.
- Rewrite `embed.ts` on top of `mount()`. It is now the only file that reads
  `document.currentScript`, sets `window.Brainbox`, or dispatches `brainbox:*`
  events. `readConfig()` stays as it is.
- Vite emits an ES build next to the IIFE. The IIFE still bundles React.

Tests. `embed.ts` still honours `data-mode="mount"` and `data-mount`;
`mount().destroy()` removes the host element.

Done when the marketing site's `widget-loader.ts` and the dashboard snippet
work unchanged.

### PR 4: docs

- Package READMEs for core, react, widget, each with the install for its
  audience.
- `CONTEXT.md`: fix the trigger section. `[data-brainbox-trigger]` was never
  built; either build it in PR 3 or remove the mention. Removing it is less
  work and nobody uses it.
- Nested `AGENTS.md` for the new packages.

### PR 5: `@brainbox/server`

New package `packages/server`. Web-standard `Request` in, typed result out,
`zod` as its only dependency.

- `parseIngest(request, limits)` does what lines 33 to 114 of `ingest.ts` do
  today: read the multipart body, validate the `json` part, check each file's
  type and size. It returns `{ payload, files }` or an `IngestError` with a
  status and message.
- The zod schemas move here from `backend/src/validation/feedback.ts`, with
  their compile-time drift guards against `@brainbox/shared`.
- `ingest.ts` becomes `parseIngest()`, then the project lookup, origin check,
  storage, insert and transcription exactly as today.
- A short `README.md` is the written-down wire format: part names, the JSON
  shape, the `{ id }` response, and the error statuses.

Tests. Build a `Request` with `FormData` and assert each error path; one happy
path. Node environment, no Postgres. The backend's integration tests keep
covering the route end to end.

### PR 6: `@brainbox/replay`

Move `SessionReplay.tsx` and `dashboard/src/lib/session.ts`
(`parseSessionPayload`) into `packages/replay`. The component uses the
dashboard's Tailwind classes and icons, so it needs its own stylesheet first.
Scope this PR after PR 5; it is the least certain of the six.

### Order

1 → 2 → 3 → 4 are sequential. 5 can run in parallel with any of them. 6 last.

## Consequences

- One engine, several faces. A host with its own React tree uses core and
  react and draws whatever it wants. A host that wants our UI adds the widget
  package. A plain HTML page keeps the script tag.
- `App.tsx` stops being the place where the hard bugs live. The screenshot
  race, the bake, and the cancelled-run guard get unit tests that need no
  React.
- The wire format gets a home (`@brainbox/server`) and a document, so a
  backend in another language can accept reports.
- More packages to version. Inside the monorepo they are consumed from source
  with `workspace:*`, so this costs nothing until publishing.
- Publishing is out of scope here. The packages stay `private: true` and emit
  nothing (`noEmit`, `allowImportingTsExtensions`). A host outside the
  monorepo needs a build step and an `exports` map, which is its own ADR.
- ADR 0003's plan of `import { Brainbox } from '@brainbox/widget/react'` is
  replaced by the three-package split above.
