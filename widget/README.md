# @ganeshdole/brainbox-widget

Brainbox's own capture UI: the floating button, the markup step, the
recorder, the composer. Built on `@ganeshdole/brainbox-core` and `@ganeshdole/brainbox-react`.
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

The tag publishes `window.Brainbox` with `open()`, `close()` and
`identify({ id, email })`, and fires a `brainbox:submitted` event on `window`
(`event.detail.id`) after each report.

## In a React app

```sh
npm install @ganeshdole/brainbox-widget @ganeshdole/brainbox-react @ganeshdole/brainbox-core
```

```tsx
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import { BrainboxWidget, useBrainboxWidget } from "@ganeshdole/brainbox-widget";

<BrainboxProvider transport={transport} identity={user}>
  <App />
  <BrainboxWidget />                         {/* trigger="floating" | "manual", position */}
</BrainboxProvider>

function ReportProblemButton() {
  const { open } = useBrainboxWidget();      // anywhere under the provider
  return <button onClick={open}>Report a problem</button>;
}
```

The widget renders into a shadow root appended to `<body>`, wherever it sits
in your tree, so your styles cannot reach it and no ancestor's `overflow` or
`transform` can trap its panels. Your React is used; the package does not
bundle one.

## Without React, from a bundler

```ts
import { mount } from "@ganeshdole/brainbox-widget";
import { brainboxTransport } from "@ganeshdole/brainbox-core";

const widget = mount({ transport: brainboxTransport({ endpoint, projectKey }), trigger: "manual" });
widget.open();
widget.identify({ id, email });
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
widget opens - serve the two files from the same folder), `dist/index.js` (an ES module of the library entry with React, `lucide-react`
and the other `@ganeshdole/brainbox-*` packages external) and the `.d.ts` files. Inside
the monorepo the package is consumed from source; the published package's
`exports` point at `dist/` (`publishConfig`). `react` and `react-dom` are peer
dependencies of the library; the IIFE still bundles them.
