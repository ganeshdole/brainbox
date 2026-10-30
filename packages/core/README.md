# @ganeshdole/brainbox-core

The Brainbox capture engine. Plain TypeScript, runs in the browser, no React
and no UI. It takes the screenshot, bakes the user's marks into it, records
the session, keeps the last console errors, and hands the finished report to
a `Transport`. Every Brainbox UI, including our own widget, is built on it.

Use it directly when you are building your own feedback UI. If you want
Brainbox's UI, see `@ganeshdole/brainbox-widget`; if you are in React, `@ganeshdole/brainbox-react`
holds an instance for you.

## Install

Inside this monorepo the package is consumed from source:

```json
{ "dependencies": { "@ganeshdole/brainbox-core": "workspace:*" } }
```

Outside it, from npm:

```sh
npm install @ganeshdole/brainbox-core
```

`pnpm build` emits `dist/` (JS plus `.d.ts`); the published package's
`exports` point at it (`publishConfig`).

## Use

```ts
import { createBrainbox, brainboxTransport } from "@ganeshdole/brainbox-core";

const brainbox = createBrainbox({
  // Brainbox Cloud, or your own backend (see Transport below)
  transport: brainboxTransport({ endpoint: "https://app.brainbox.ganeshdole.com/ingest", projectKey: "pk_..." }),
  identity: { id: user.id, email: user.email },
  onSubmitted: ({ id }) => console.log("filed", id),
});

// One report in progress. `exclude` is your own UI's root element, left out
// of the screenshot.
const draft = brainbox.draft({ exclude: panelEl });
draft.subscribe(() => render(draft.getState()));

draft.captureScreenshot();            // start rasterising the page now
draft.markUp(marks);                  // the marks' bounds become the region; baked in the background
await draft.submit({ text, audio });  // waits for the bake, then transport.send()
draft.cancel();                       // drop everything; the draft can be used again

brainbox.destroy();                   // restores console.error, cancels live drafts
```

A recording instead of a screenshot:

```ts
const rec = draft.startRecording({ onAutoStop: () => void rec.stop() });
rec.annotations.show(mark);           // drawn into the page, so it shows in the replay
rec.setMicMuted(true);
await rec.stop();                     // attaches the session and voice, takes a thumbnail
```

`DraftState` is what a UI renders from: `screenshotUrl`, `screenshotPending`,
`screenshotFailed`, `hasSession`, `hasVoice`. It is a new object on every
change, so `useSyncExternalStore` and friends can compare by reference.

## Privacy

For a host that shows regulated data, everything a report carries can be cut
down. None of it is on by default.

```ts
createBrainbox({
  transport,
  privacy: {
    maskAllText: true,           // recordings: every piece of text, not only .rr-mask
    maskTextSelector: ".phi",    // or just these elements (and their descendants)
    maskScreenshots: true,       // screenshots follow the same rules
  },
  // The last word before upload: scrub what you may not send, or return null
  // to send nothing (submit then rejects, so the UI doesn't claim it was sent).
  beforeSend: (report) => ({
    ...report,
    metadata: { ...report.metadata, url: report.metadata.url.split("?")[0], consoleErrors: [] },
  }),
});
```

With `maskScreenshots`, a screenshot boxes out `.rr-block` elements and covers
form field values and masked text, line by line. It is off by default because
some hosts block heavy elements from recordings only to keep them small.

## Options

Everything else `createBrainbox()` takes is opt-in or opt-out. Left out, each
behaves as it always has.

```ts
createBrainbox({
  transport,
  consoleErrors: false,                 // never patch console.error; reports carry no errors
  recording: {
    audio: false,                       // record without the mic (no permission prompt)
    rrweb: { recordCanvas: true, sampling: { scroll: 150 } }, // more rrweb record() options
  },
  screenshot: {
    maxScale: 1,                        // render at 1x instead of up to 2x (default 2)
    assetTimeoutMs: 3000,               // give up on a slow image or font sooner (default 6000)
    maxBytes: 2 * 1024 * 1024,          // redo a shot at 1x above this (default 5 MB)
  },
});

draft.startRecording({ audio: true }); // one recording can differ from the instance
```

`recording.rrweb` is laid over the engine's defaults, but it cannot loosen
privacy: `emit`, input masking and the `rr-` classes stay the engine's, and
text masking goes through `privacy`.

## Loading the capture libraries

rrweb and modern-screenshot are most of the engine's weight, so they load on
the first capture, not with this package. By default that is a dynamic
`import()`, which your bundler splits into chunks of their own. To load them
some other way (a CDN, a copy your app already ships), pass a `loader`:

```ts
import { createBrainbox, type CaptureLoader } from "@ganeshdole/brainbox-core";
import { record } from "rrweb";                 // already in your bundle
import { domToCanvas } from "modern-screenshot";

const loader: CaptureLoader = {
  recorder: async () => ({ record }),
  rasteriser: async () => ({ domToCanvas }),
};

const brainbox = createBrainbox({ transport, loader });
brainbox.preloadCapture(); // e.g. when your feedback panel opens
```

Each function is called on every capture, so cache what you fetch (a module
`import()` already is). Brainbox's own `widget.js` uses this seam to fetch both
libraries as one sibling script.

## Transport

Core does not know about project keys or endpoints. `brainboxTransport()`
speaks the Brainbox backend's `/ingest` format. To send reports somewhere
else, implement the one-method interface:

```ts
import type { Transport } from "@ganeshdole/brainbox-core";

const mine: Transport = {
  async send(report) {
    const fd = new FormData();
    fd.append("json", JSON.stringify({ text: report.text, region: report.region, metadata: report.metadata }));
    if (report.screenshot) fd.append("screenshot", report.screenshot, "screenshot.png");
    const res = await fetch("/api/feedback", { method: "POST", body: fd, headers: { Authorization: token } });
    return { id: (await res.json()).id };
  },
};
```

`Report` carries `text`, `region`, `metadata` (`CapturedMetadata` from
`@ganeshdole/brainbox-shared`), and the `screenshot`, `session` and `audio` blobs.

## Build your own

`createBrainbox()` and `Draft` are one way to put the pieces together. The
pieces are exported too, for a host that wants its own pipeline: each is a
plain function, holds nothing between calls, and loads rrweb or
modern-screenshot only when it runs.

```ts
import {
  bakeMarks,
  captureErrors,
  captureMetadata,
  captureViewport,
  createAnnotations,
  cssPath,
  elementAt,
  startSessionRecording,
  type Mark,
} from "@ganeshdole/brainbox-core";

// A screenshot of the page, minus your own panel.
const shot = await captureViewport({ exclude: panelEl, privacy: { maskScreenshots: true } });

// Marks baked onto it. Mark coordinates are viewport CSS pixels by default;
// pass { scale: 1 } for marks in an image's own pixels.
const box: Mark = { kind: "box", id: "1", color: "#ff4d4f", x: 40, y: 80, width: 200, height: 60 };
const baked = await bakeMarks(shot, [box]);

// What sits under the marks, as a CSS path.
const selector = cssPath(elementAt(140, 110, panelEl));

// Console errors from now on, and a snapshot of the page when you send.
const errors = captureErrors({ max: 50 });
const metadata = captureMetadata({ consoleErrors: errors.snapshot(), selector });
errors.stop(); // restores console.error once no log is listening

// A session recording, with marks drawn into the page so the replay shows them.
const rec = startSessionRecording({ maxMs: 30_000, audio: false, onAutoStop: () => void finish() });
const annotations = createAnnotations();
annotations.show(box);
async function finish() {
  const { session, audio } = await rec.stop(); // gzipped rrweb log, and narration if recorded
  annotations.clear();
  await myTransport.send({ metadata, screenshot: baked, session, audio: audio ?? undefined });
}
```

| Export | What it does |
|---|---|
| `captureViewport(options?)` | PNG of the viewport. `exclude`, `privacy`, `loader`, and the `screenshot` tuning. |
| `bakeMarks(image, marks, { scale?, maxBytes? }?)` | Marks flattened onto an image, as a PNG. |
| `startSessionRecording(options?)` | rrweb recording, with or without the mic. `stop()` resolves `{ session, audio }`. |
| `createAnnotations()` | Marks drawn into the host page (`show`, `undo`, `inView`, `clear`). |
| `captureErrors({ max? }?)` | A rolling buffer of console errors; `snapshot()`, `stop()`. |
| `captureMetadata(input?)` | URL, title, viewport, browser, plus identity, fields, selector, errors. |
| `elementAt(x, y, exclude?)`, `cssPath(el)` | The element under a point, and a CSS path to it. |
| `startAudioRecording()` | A mic recording on its own (a voice note). |
| `preloadCapture(loader?)`, `defaultCaptureLoader` | Start loading the capture libraries early. |

## Rules

- Importing does nothing, and loads neither rrweb nor modern-screenshot.
  Only a call has effects, and `destroy()` undoes everything an instance set up.
- No module-level state, so two instances on one page do not share buffers.
  The one shared thing is the `console.error` hook, installed when the first
  instance asks and removed when the last one goes.
- Privacy defaults in recordings: inputs are masked; `.rr-block`, `.rr-mask`
  and `.rr-ignore` on host elements are honoured. More is opt-in, see Privacy.
