# @brainbox/replay

Plays back a Brainbox session recording: the rrweb log the widget uploaded
as the `session` part, with the voice note lined up to it. Drop it into any
React admin that has the file URLs.

## Use

```tsx
import { SessionReplay } from "@brainbox/replay";
import "@brainbox/replay/styles.css";

<SessionReplay
  url={issue.session.url}          // the gzipped rrweb log
  audioUrl={issue.audio?.url}      // optional voice track
  vw={issue.metadata.viewport.width}
  vh={issue.metadata.viewport.height}
  credentials="include"            // RequestCredentials for the fetch; default "same-origin"
/>
```

The frame scales the recorded viewport (`vw` by `vh`) to fit its container.
Play, pause, seek and mute are built in.

## Theming

Everything visual is a custom property on `.bb-replay`, with dark defaults:

```css
.bb-replay {
  --bb-replay-bg: #0a0a0a;
  --bb-replay-frame-bg: #000;
  --bb-replay-border: #262626;
  --bb-replay-fg: #e5e5e5;
  --bb-replay-muted: #8a8a8a;
  --bb-replay-accent: #fff;
  --bb-replay-accent-hover: #d4d4d4;
  --bb-replay-accent-fg: #000;
  --bb-replay-error-bg: rgba(239, 68, 68, 0.1);
  --bb-replay-error-border: rgba(239, 68, 68, 0.3);
  --bb-replay-error-fg: #f87171;
  --bb-replay-radius: 12px;
}
```

## Helpers

`parseSessionPayload(text)` reads the log's `{ v, events, audioOffsetMs? }`
and tolerates older logs without an offset. `formatClock(ms)` gives `m:ss`.

## Install

Inside this monorepo the package is consumed from source (`workspace:*`).
Outside the monorepo, `pnpm build` emits `dist/` (JS plus `.d.ts`) and
`pnpm pack` produces a tarball whose `exports` point at it (`publishConfig`),
so another app can `npm install` the `.tgz` files. Every `@brainbox/*`
dependency of a package needs its own tarball installed alongside.

## Peer dependencies

`react` and `react-dom` 19+. `@rrweb/replay` is bundled with the package.
