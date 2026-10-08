# @brainbox/core

The Brainbox capture engine. Plain TypeScript, runs in the browser, no React
and no UI. It takes the screenshot, bakes the user's marks into it, records
the session, keeps the last console errors, and hands the finished report to
a `Transport`. Every Brainbox UI, including our own widget, is built on it.

Use it directly when you are building your own feedback UI. If you want
Brainbox's UI, see `@brainbox/widget`; if you are in React, `@brainbox/react`
holds an instance for you.

## Install

Inside this monorepo the package is consumed from source:

```json
{ "dependencies": { "@brainbox/core": "workspace:*" } }
```

## Use

```ts
import { createBrainbox, brainboxTransport } from "@brainbox/core";

const brainbox = createBrainbox({
  // Brainbox Cloud, or your own backend (see Transport below)
  transport: brainboxTransport({ endpoint: "https://app.brainbox.sh/ingest", projectKey: "pk_..." }),
  identity: { id: user.id, email: user.email },
  onSubmitted: ({ id }) => console.log("filed", id),
});

// One report in progress. `exclude` is your own UI's root element, hidden
// while the page is screenshotted.
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

## Transport

Core does not know about project keys or endpoints. `brainboxTransport()`
speaks the Brainbox backend's `/ingest` format. To send reports somewhere
else, implement the one-method interface:

```ts
import type { Transport } from "@brainbox/core";

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
`@brainbox/shared`), and the `screenshot`, `session` and `audio` blobs.

## Rules

- Importing does nothing. `createBrainbox()` is the only way in, and
  `destroy()` undoes everything it set up.
- No module-level state, so two instances on one page do not share buffers.
  The one shared thing is the `console.error` hook, installed when the first
  instance asks and removed when the last one goes.
- Privacy defaults in recordings: inputs are masked; `.rr-block`, `.rr-mask`
  and `.rr-ignore` on host elements are honoured.
