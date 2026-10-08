# replay - AGENTS.md

The session player (`@brainbox/replay`): a React component that plays back a
widget recording with its voice track, plus the helpers that read the log.
Root rules in `/AGENTS.md` apply; ADR 0005 explains why this is its own
package.

## What this package is

- `<SessionReplay url audioUrl vw vh />` fetches the gzipped rrweb log, drives
  `@rrweb/replay` directly (rrweb-player's shipped dist is broken) and keeps
  the voice track glued to the replay through `audioOffsetMs`.
- `parseSessionPayload(text)` reads `{ v, events, audioOffsetMs? }`.
- `formatClock(ms)` is the `m:ss` the controls show.

The dashboard is one host. Anything that could show a Brainbox recording in
its own admin is another, which is why nothing here knows about the
dashboard's router, API client or Tailwind setup.

## Styling

Plain CSS in `src/styles.css`, imported by the host as
`@brainbox/replay/styles.css`. Class names are `bb-replay*`; colours and
radius come from `--bb-replay-*` custom properties with dark defaults, so a
host themes it by setting those on `.bb-replay`. No Tailwind, no utility
classes: a host should not have to scan this package for class names.

## Tests

Vitest under jsdom for the helpers. The component needs a real `Replayer`
and a fetchable log, which the dashboard exercises by hand. Run:
`pnpm -F @brainbox/replay test`.
