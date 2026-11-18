# video - AGENTS.md

The launch film (`@ganeshdole/brainbox-video`), built in Remotion. Root rules in
`/AGENTS.md` apply. Private: it is never published.

## What it is

One 52-second product film, three frames: `Launch` (1920×1080 master),
`LaunchSquare` (1080×1080) and `LaunchVertical` (1080×1920). All three render
the same `<Launch format>` component; the social cuts scale the 16:9 stage and
put the captions in the band below it.

The story is `STORY.md`: who the film is for, the spine, every beat and its
job, and the rules it keeps. Change the story there first, then the numbers.
Six acts: the hook (the founder's editor, the "it's broken" thread sliding
in, then "That's the whole bug report."), the broken checkout, the widget
(tap, circle, talk), the ticket building itself in GitHub, the same report as
Linear, Slack and Gmail show it, and an agent (Claude Code) shipping the fix.
The agent act is where the product is going, not a shipped feature; keep its
captions honest about that if the roadmap changes.

## The Reels

`src/reels/` holds short vertical films built for Instagram Reels (and
Shorts), not reframed from the film. They are a series: an episode in
`episodes.ts` is one vague message an end-user really sends plus the report
for the same bug, and each Reel renders per episode.

- `ReelBugReport-<episode>` (`WholeBugReport.tsx`, about 15 s): the
  "it's broken" thread, "That's the whole bug report.", then the same bug on
  a phone with the widget (tap, circle, say it), then the ticket. Only the
  checkout episode has a host app drawn on the phone.
- `ReelSaid-<episode>` (`SaidVsNeeded.tsx`, 10 s): the one line alone,
  then the ticket for the same bug builds under it. A new episode is a new
  entry in `episodes.ts` and nothing else.

`timing.ts` is their storyboard and layout. `SAFE` is the part of the
1080×1920 frame Instagram draws nothing over (its header, the right-hand
button rail, the caption and audio bar); every block in `LAYOUT` must sit
inside it, and `reels.test.ts` checks that, the tap points, caption reading
time, and that each episode's ticket is what `renderTicket()` writes for the
same report (title, transcript, selector, errors). Keep transcripts short
enough that the title isn't truncated. Both Reels end on black so the loop
back to frame one is dark to dark. `pnpm -F @ganeshdole/brainbox-video
render:reels` renders every Reel to `out/reels/`.

## How it is organised

- `src/timeline.ts` is the storyboard as numbers: scenes, captions, cursor
  keyframes, click frames, when each ticket block lands, where sounds sit.
  Change timing here, not in components. `src/timeline.test.ts` keeps it
  honest (contiguous scenes, no overlapping captions, clicks only while the
  cursor is parked).
- `src/Launch.tsx` is the camera: a 1920×1080 stage seen through keyframed
  zoom and pan, clamped so it never looks past the stage edge. The whip from
  the host app to GitHub lives here too.
- `src/ui/*` are the things on stage. `Widget.tsx` mirrors the real components
  in `widget/src/components` (same copy, layout, radii); `GithubIssue.tsx`
  follows `renderTicket()` in `packages/integrations` block for block. If the
  widget or the ticket format changes, change the film to match. `Destinations.tsx`
  is the same four tools as the landing page's integrations section, each
  drawn full-frame in its own look (a diagram was tried and cut: it read as a
  flowchart); `Icons.tsx` carries the landing page's exact marks plus
  Claude's. `Hook.tsx` and `Agent.tsx` are the opening and the vision act,
  bookended on the same file, `pay.ts`.
- `src/theme.ts` carries the fonts and colours; they are the landing page's
  and the widget's, not new ones.
- `public/audio/*` are the sounds: a 20 s music loop that Remotion loops
  and automates (`bedVolume()` in the timeline: in, ducked under the voice,
  out), one effect per motion it confirms, and the end-user's voice note.
  Sources and licences are in `public/audio/README.md`; the bed, the two
  ElevenLabs effects and the voice are free-tier renders and must be replaced
  or re-licensed before publishing. The film must still make sense muted.

## Working on it

- `pnpm -F @ganeshdole/brainbox-video dev` opens Remotion Studio for scrubbing.
- `pnpm -F @ganeshdole/brainbox-video render` writes `out/brainbox-launch.mp4`
  (`render:square`, `render:vertical` for the cuts). `out/` is gitignored.
- A cheap visual check is a half-size contact sheet:
  `pnpm exec remotion render src/index.ts Launch out/sheet --sequence --image-format=jpeg --scale=0.5 --every-nth-frame=15`.
- Motion rules: ease-out, no overshoot (`pop()` in `motion.ts`), one motion at
  a time, stagger lists a few frames per row, give captions reading time, no
  logo before the last scene. Nothing holds perfectly still: the host camera
  breathes a little, the whip dips scale for depth, captions blur in.
- Stage anchors (`PAY_NOW`, `LAUNCHER`) are measured off a rendered frame, not
  derived from the layout; `timeline.test.ts` pins them. If `Checkout.tsx`
  changes, re-measure (render frame 0, find the dark button rows) and update.
- `pnpm verify` covers this package: lint, `tsc -b`, the timeline tests. A
  render is not part of `verify`; it takes minutes and needs Chromium.
