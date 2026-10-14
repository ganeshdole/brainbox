# @ganeshdole/brainbox-widget

Brainbox's own capture UI: the floating button, the markup step, the
recorder, the composer, and the feature-request form. Built on `@ganeshdole/brainbox-core` and `@ganeshdole/brainbox-react`.
Three ways in, one UI.

## Script tag

For a page with no build step. Paste before `</body>`:

```html
<script src="https://app.brainbox.sh/widget.js"
        data-project="pk_..."
        data-endpoint="https://app.brainbox.sh/ingest"></script>
```

| Attribute | Values | Default |
|---|---|---|
| `data-project` | your project key | required |
| `data-endpoint` | where reports are POSTed | required |
| `data-mode` | `float` (our button) or `mount` (your own trigger) | `float` |
| `data-mount` | CSS selector of your trigger, with `data-mode="mount"` | |
| `data-position` | `bottom-right`, `bottom-left`, `top-right`, `top-left` | `bottom-right` |
| `data-theme` | `dark`, `light`, or `system` to follow the visitor's OS | `dark` |
| `data-feature-requests` | `off` hides "Suggest a feature" in the chooser | on |

The tag publishes `window.Brainbox` with `open()`, `start(mode)`, `close()`,
`isBrainboxEvent(e)` (see [Focus traps](#focus-traps)),
`identify({ id, email, name, phone })` and `setFields([{ label, value, type }])`
(your app's own details for every report; see the React package README), and fires a `brainbox:submitted` event on `window`
(`event.detail.id`) after each report.

### Your own buttons

Mark any element on the page with `data-brainbox` and a click on it opens the
widget, no script of your own needed. It works for elements your app renders
later too.

```html
<button data-brainbox="feature">Request a feature</button>
<button data-brainbox="screenshot">Report a bug</button>
```

| `data-brainbox` | Opens |
|---|---|
| `feature` | the feature-request form: what the user wants, typed or spoken, how much it matters, and an optional screenshot |
| `screenshot` | straight into marking up a screenshot |
| `record` | straight into a recording |
| `open` (or empty) | the chooser |

The same from script: `window.Brainbox.start("feature")`.

## Feature requests

Besides bug reports, the widget takes feature requests. The end-user says what
they are trying to do (typed, or as a voice note), can say how much it matters
(nice to have, important, blocking me) and can attach a marked-up screenshot.
It reaches the dashboard and your destinations as a feature request, with the
same reporter and app fields as a bug, and no console errors.

They reach the form three ways: "Suggest a feature" in our chooser (hide it
with `data-feature-requests="off"`, or `featureRequests={false}` on
`<BrainboxWidget />` and `mount()`), a `data-brainbox="feature"` element, or
`start("feature")`. Hiding the chooser option leaves the other two working,
for an app that wants feature requests only from its own button.

## In a React app

```sh
npm install @ganeshdole/brainbox-widget @ganeshdole/brainbox-react @ganeshdole/brainbox-core
```

```tsx
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import { BrainboxWidget, useBrainboxWidget } from "@ganeshdole/brainbox-widget";

<BrainboxProvider transport={transport} identity={user}>
  <App />
  <BrainboxWidget />                         {/* trigger="floating" | "manual", position, theme, featureRequests */}
</BrainboxProvider>

function ReportProblemButton() {
  const { open } = useBrainboxWidget();      // anywhere under the provider
  return <button onClick={open}>Report a problem</button>;
}

function RequestFeatureButton() {
  const { start } = useBrainboxWidget();
  return <button onClick={() => start("feature")}>Request a feature</button>;
}
```

`useBrainboxWidget()` returns `{ isOpen, open, start, close }`. `open()` shows
our chooser. If your own UI already offers the choices, `start("screenshot")`,
`start("record")` or `start("feature")` goes straight into one. Recording
falls back to the chooser in a browser that cannot record (`canSessionRecord()`
from `@ganeshdole/brainbox-core` tells you in advance).

The widget renders into a shadow root appended to `<body>`, wherever it sits
in your tree, so your styles cannot reach it and no ancestor's `overflow` or
`transform` can trap its panels. Your React is used; the package does not
bundle one. Clicks on the widget stop at its shadow host, so a menu your page
closes on an outside click stays open while the user reports it (a listener in
the capture phase still sees them).

### Focus traps

Keys are not stopped, but a modal of yours can still swallow them. Outside its
shadow root, a key typed in the widget has `event.target` set to the widget's
host element (`#brainbox-widget`), so a focus trap that cancels Space, Enter
and Tab aimed outside your modal cancels them in our composer too. That
happens most after a recording, when the composer opens over a modal the user
opened to reproduce the bug.

While a panel is open the host element carries `role="dialog"` and
`aria-modal="true"`, which traps that let other dialogs through already
respect. If yours doesn't, exempt the widget explicitly:

```ts
import { isBrainboxEvent } from "@ganeshdole/brainbox-widget";

document.addEventListener("keydown", (e) => {
  if (isBrainboxEvent(e) || modal.contains(e.target as Node)) return;
  // ...your trap
}, true);
```

`BRAINBOX_HOST_ID` is the element's id, if you'd rather match on that. With the
script tag, the same check is `window.Brainbox.isBrainboxEvent(e)`.

## Without React, from a bundler

```ts
import { mount } from "@ganeshdole/brainbox-widget";
import { brainboxTransport } from "@ganeshdole/brainbox-core";

const widget = mount({ transport: brainboxTransport({ endpoint, projectKey }), trigger: "manual" });
widget.open();
widget.start("feature");                     // or "screenshot", "record"
widget.identify({ id, email, name, phone });
widget.setFields([{ label: "Plan", value: "Pro" }]);
widget.destroy();
```

## Where things live

| Concern | Package |
|---|---|
| What gets captured and sent | `@ganeshdole/brainbox-core` |
| Holding an instance in React | `@ganeshdole/brainbox-react` |
| What the user sees | this package |

Reports go wherever the `Transport` sends them. `brainboxTransport()` is
Brainbox Cloud; see `@ganeshdole/brainbox-core` for pointing one at your own backend.

## Build

`pnpm build` emits `dist/widget.js` (the script-tag IIFE, everything bundled
except the capture libraries), `dist/widget-capture.js` (rrweb and
modern-screenshot, which `widget.js` loads from beside itself the first time the
widget opens - serve the two files from the same folder), `dist/index.js` (an ES module of the library entry with React and the other
`@ganeshdole/brainbox-*` packages external) and the `.d.ts` files. The library
entry is a few KB: the screens and their stylesheet are a split chunk that
`<BrainboxWidget />` loads when its launcher first shows or, with
`trigger="manual"`, when you first `open()` or `start()` it. Inside
the monorepo the package is consumed from source; the published package's
`exports` point at `dist/` (`publishConfig`). `react` and `react-dom` are peer
dependencies of the library; the IIFE still bundles them.
