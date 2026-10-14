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

## Compose your own

The widget is a flow over a handful of screens, and each one is yours to
replace or reuse. Three entry points, each importing only what it needs:

| Import | What's in it |
|---|---|
| `@ganeshdole/brainbox-widget` | `<BrainboxWidget />`, `mount()`, and the prop types. A few KB; the screens load on first open |
| `@ganeshdole/brainbox-widget/ui` | every screen, the drawing and mic hooks, and the style helpers below |
| `@ganeshdole/brainbox-widget/markup` | just the markup step: overlay, toolbar, mark shapes, `useDrawing`, `DraftMarkup`, and the style helpers |

Every screen is controlled. It takes its data as props and reports back
through callbacks, and none of them reads the widget's store or a Brainbox
instance, so it works outside our flow.

| Screen | What it is | Moves on with |
|---|---|---|
| `Launcher` | the floating button | `onClick` |
| `Chooser` | screenshot, record, or suggest a feature | `onScreenshot`, `onRecord`, `onFeature?`, `onCancel` |
| `MarkupOverlay` | drawing on the frozen page | `onDone(marks)`, `onCancel` |
| `RecordOverlay` | the bar while a session records | `onStop` |
| `Composer` | a bug report's words and voice | `onSubmit(text, audio)`, `onCancel` |
| `FeatureComposer` | the feature-request form | `onSubmit(text, audio, importance)`, `onScreenshot`, `onRemoveScreenshot`, `onCancel` |
| `Result` | sending, sent or failed | `onClose` |

Their props are exported as `LauncherProps`, `ChooserProps` and so on, with
each field documented. Smaller pieces: `VoiceNote`, `BarRow`, `MarkShape`,
`MarkTextInput`, `MarkupToolbar`, `useDrawing` and `useMultibandVolume`.

### Replace one step

`components` swaps any step for your own component and keeps the rest of
ours. Here our markup and recording stay, and the composer is yours:

```tsx
import { BrainboxWidget, type ComposerProps } from "@ganeshdole/brainbox-widget";

function MyComposer({ screenshotUrl, capturePending, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState("");
  return (
    <div className="my-composer">
      <style>{myComposerCss}</style>
      {capturePending ? <Spinner /> : screenshotUrl && <img src={screenshotUrl} alt="" />}
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => onSubmit(text, null)}>Send</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}

const components = { Composer: MyComposer };   // outside render, or it remounts

<BrainboxWidget components={components} />
mount({ transport, components });              // same, without a React tree of yours
```

The slots are `Launcher`, `Chooser`, `MarkupOverlay`, `RecordOverlay`,
`Composer`, `FeatureComposer` and `Result`, typed as `WidgetComponents`. Each
gets the props of the built-in screen of the same name. Call its callbacks
to move the flow on: `onSubmit` sends the report and shows `Result`,
`onCancel` throws it away. The script tag takes no components, since it
brings its own React.

Your component renders inside the widget's shadow root, so two things
follow. Your page's stylesheets don't reach it: bring its CSS along (a
`<style>` inside it, as above, or inline styles), or `createPortal` it out
to `document.body` to use your app's. And it starts from our reset
(Tailwind's preflight), so a `<button>` has no border or background until
you give it one.

### Markup on its own

The markup step works without the widget, over a core `Draft` or over any
image.

Over a draft, `DraftMarkup` starts the screenshot when it mounts and hands
the marks to `draft.markUp()`, which bakes them onto the shot in the
background. The draft needs the element to keep out of its screenshot, so
create the shadow host first:

```tsx
import { useBrainbox } from "@ganeshdole/brainbox-react";
import { BrainboxShadow, createShadowHost, DraftMarkup } from "@ganeshdole/brainbox-widget/markup";

function MarkItUp({ onDone }: { onDone: () => void }) {
  const brainbox = useBrainbox();
  const [host] = useState(createShadowHost);
  const draft = useMemo(() => brainbox?.draft({ exclude: host.element }), [brainbox, host]);
  if (!draft) return null;
  return (
    <BrainboxShadow host={host} theme="light">
      <DraftMarkup draft={draft} onDone={onDone} onCancel={() => draft.cancel()} />
    </BrainboxShadow>
  );
}
// later: await draft.submit({ text }) sends the baked screenshot
```

Over a plain image, `MarkupOverlay` takes `screenshotUrl` and gives you the
marks. They are core `Mark`s in viewport CSS pixels over the full-viewport
image. `paintMarks(ctx, marks)` from `@ganeshdole/brainbox-core` draws them
onto a canvas of your own.

```tsx
<BrainboxShadow>
  <MarkupOverlay screenshotUrl={url} hint="Circle what to change" onDone={save} onCancel={close} />
</BrainboxShadow>
```

To build your own surface, use `useDrawing({ color, onCommit })` for the
drag-to-draw, `MarkShape` to render a mark as SVG, and `MarkupToolbar` for
the tool row.

### Styles

The screens are styled by the widget's stylesheet, which is scoped to a
shadow root on purpose. It carries Tailwind's preflight and utility class
names that would reset or collide with your page, so there is no global
`.css` file. Two ways in:

- `<BrainboxShadow theme>` renders its children into a shadow root on
  `<body>`, the same as the widget does: the stylesheet, the theme, and your
  page's CSS and outside-click listeners kept away. Pass `host` from
  `createShadowHost()` when you need the element first. This is what you
  want almost always.
- `widgetCss` is the stylesheet as a string, for a shadow root of your own.
  Render it in a `<style>` inside the root, around an element with the
  `bb-root` class (plus `dark` for the dark theme).

If you import a screen and never use `BrainboxShadow` or `widgetCss`, the
stylesheet (about 40 KB, 10 KB gzipped) is left out of your bundle.

### Theming

Colours are CSS variables, the same design tokens the dashboard uses. The
container inside every Brainbox shadow root is the part `root`, so your page
can set the tokens from outside, in either theme:

```css
#brainbox-widget::part(root) {
  --bg-brand: #6d28d9;        /* primary buttons, the launcher, the active tool */
  --bg-brand-hover: #5b21b6;
  --text-on-brand: #ffffff;
}
```

The surfaces (`--bg-elevated`, `--bg-background`), text (`--text-emphasis`,
`--text-default`, `--text-muted`) and borders (`--border-default`) work the
same way. `src/styles/tokens.css` lists them all.

`widget/compose.html` (`pnpm dev`, then `/compose.html`) is a dev page with
all of the above running: a composer override, the markup brick over a
draft and over an image, and a themed brand colour.

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
widget opens - serve the two files from the same folder), `dist/index.js`, `dist/ui.js` and `dist/markup.js` (ES modules of the
library entries, sharing their chunks, with React and the other
`@ganeshdole/brainbox-*` packages external) and the `.d.ts` files. The main
entry is a few KB: the screens and their stylesheet are a split chunk that
`<BrainboxWidget />` loads when its launcher first shows or, with
`trigger="manual"`, when you first `open()` or `start()` it. Inside
the monorepo the package is consumed from source; the published package's
`exports` point at `dist/` (`publishConfig`). `react` and `react-dom` are peer
dependencies of the library; the IIFE still bundles them.
