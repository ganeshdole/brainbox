/**
 * The whole film as numbers. Every scene, caption, cursor move and click is
 * keyed to a frame here, so the storyboard is reviewable as a diff and the
 * React components only ask "what is true at frame N".
 *
 * The story this encodes is STORY.md. Change the story first, then these.
 *
 * 30 fps. The 16:9 master is 52 s; the square and vertical cuts share it.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Seconds → frames, so the storyboard below reads in time, not counts. */
export const s = (seconds: number): number => Math.round(seconds * FPS);

export interface Scene {
  id: "hook" | "checkout" | "trigger" | "markup" | "voice" | "ticket" | "hold" | "destinations" | "agent" | "end";
  from: number;
  to: number;
}

export const SCENES: readonly Scene[] = [
  { id: "hook", from: s(0), to: s(3.2) },
  { id: "checkout", from: s(3.2), to: s(5.6) },
  { id: "trigger", from: s(5.6), to: s(8.0) },
  { id: "markup", from: s(8.0), to: s(11.0) },
  { id: "voice", from: s(11.0), to: s(18.4) },
  { id: "ticket", from: s(18.4), to: s(26.4) },
  { id: "hold", from: s(26.4), to: s(29.2) },
  { id: "destinations", from: s(29.2), to: s(36.4) },
  { id: "agent", from: s(36.4), to: s(46.6) },
  { id: "end", from: s(46.6), to: s(52) },
];

export const DURATION = SCENES[SCENES.length - 1]?.to ?? 0;

/* ---------------------------------------------------------------------- */
/* Act zero: the hook. The founder's screen, interrupted.                  */

export const MESSAGES: readonly string[] = ["hey the checkout is broken", "it just does nothing??", "can u fix asap"];

export const HOOK = {
  /** Each notification slides in half a second after the last. */
  bubbles: [s(0.05), s(0.55), s(1.05)] as readonly number[],
  headline: s(1.6),
  sub: s(2.1),
  /** Push-through into the checkout. */
  out: s(2.6),
  outFrames: 18,
} as const;

export interface Caption {
  from: number;
  to: number;
  text: string;
  /** A smaller second line, for a quote or a qualifier. */
  sub?: string;
}

export const CAPTIONS: readonly Caption[] = [
  { from: s(3.5), to: s(5.5), text: "Here’s what actually happened." },
  { from: s(5.8), to: s(7.9), text: "Your user taps once." },
  { from: s(8.2), to: s(10.8), text: "Circles what broke." },
  { from: s(11.2), to: s(18.2), text: "Talks.", sub: "“Hey, so… I hit Pay now and nothing happens?”" },
  { from: s(19.1), to: s(22.9), text: "A ticket. Not a complaint." },
  { from: s(23.1), to: s(26.2), text: "Screen, words, browser, errors.", sub: "Attached, every time." },
  { from: s(26.9), to: s(29.0), text: "Nothing left to ask the user." },
  { from: s(29.6), to: s(36.0), text: "Lands where your team works.", sub: "GitHub, Linear, Slack, Gmail. Anything with a webhook." },
  { from: s(37.4), to: s(41.8), text: "Then your agent takes it from here.", sub: "It gets the screen, the words and the errors too." },
  { from: s(42.4), to: s(46.3), text: "From a tap to a fix." },
];

/** Where the cursor is, in stage pixels, at given frames. It eases between
 *  neighbours and parks on the last one. */
export interface CursorKey {
  frame: number;
  x: number;
  y: number;
}

/* Stage anchors, so the cursor path and the drawn components agree. */
/** Measured off a rendered frame (the card lays itself out); the test guards it. */
export const PAY_NOW = { x: 960, y: 613, w: 448, h: 48 };
export const LAUNCHER = { x: 1848, y: 1008 };
export const CHOOSER_SCREENSHOT = { x: 1736, y: 866 };
export const BOX_FROM = { x: PAY_NOW.x - PAY_NOW.w / 2 - 14, y: PAY_NOW.y - PAY_NOW.h / 2 - 12 };
export const BOX_TO = { x: PAY_NOW.x + PAY_NOW.w / 2 + 14, y: PAY_NOW.y + PAY_NOW.h / 2 + 12 };
export const TOOLBAR_NEXT = { x: 1176, y: 1024 };
export const COMPOSER_MIC = { x: 1560, y: 922 };
export const COMPOSER_SEND = { x: 1696, y: 1012 };

export const CURSOR: readonly CursorKey[] = [
  { frame: s(3.2), x: 1240, y: 420 },
  { frame: s(3.8), x: PAY_NOW.x + 30, y: PAY_NOW.y + 4 },
  { frame: s(4.7), x: PAY_NOW.x + 30, y: PAY_NOW.y + 4 },
  { frame: s(4.85), x: PAY_NOW.x + 34, y: PAY_NOW.y + 6 },
  { frame: s(5.6), x: PAY_NOW.x + 34, y: PAY_NOW.y + 6 },
  { frame: s(6.2), x: LAUNCHER.x, y: LAUNCHER.y },
  { frame: s(6.8), x: LAUNCHER.x, y: LAUNCHER.y },
  { frame: s(7.4), x: CHOOSER_SCREENSHOT.x, y: CHOOSER_SCREENSHOT.y },
  { frame: s(8.0), x: CHOOSER_SCREENSHOT.x, y: CHOOSER_SCREENSHOT.y },
  { frame: s(8.6), x: BOX_FROM.x, y: BOX_FROM.y },
  { frame: s(8.9), x: BOX_FROM.x, y: BOX_FROM.y },
  { frame: s(9.8), x: BOX_TO.x, y: BOX_TO.y },
  { frame: s(10.1), x: BOX_TO.x, y: BOX_TO.y },
  { frame: s(10.6), x: TOOLBAR_NEXT.x, y: TOOLBAR_NEXT.y },
  { frame: s(11.0), x: TOOLBAR_NEXT.x, y: TOOLBAR_NEXT.y },
  { frame: s(11.6), x: COMPOSER_MIC.x, y: COMPOSER_MIC.y },
  { frame: s(17.9), x: COMPOSER_MIC.x, y: COMPOSER_MIC.y },
  { frame: s(18.1), x: COMPOSER_SEND.x, y: COMPOSER_SEND.y },
  { frame: s(18.4), x: COMPOSER_SEND.x, y: COMPOSER_SEND.y },
];

/** Frames at which the cursor presses. */
export const CLICKS = {
  payNow1: s(4.0),
  payNow2: s(4.9),
  launcher: s(6.35),
  screenshot: s(7.55),
  boxStart: s(8.9),
  boxEnd: s(9.8),
  next: s(10.7),
  mic: s(11.8),
  micStop: s(17.8),
  send: s(18.2),
} as const;

export const CLICK_FRAMES: readonly number[] = Object.values(CLICKS);

/** Presses that start a drag, so the cursor is allowed to move right after. */
export const DRAGS: readonly number[] = [CLICKS.boxStart];

/** The whip from the host app to GitHub. */
export const WHIP = { from: s(18.4), to: s(19.0) };

/** When each block of the GitHub issue lands. */
export const TICKET = {
  page: s(18.9),
  title: s(19.2),
  image: s(19.9),
  voice: s(20.8),
  table: s(21.6),
  errors: s(22.5),
  footer: s(23.3),
  /** Camera pushes into the console errors. */
  zoomIn: s(26.4),
  zoomOut: s(28.6),
} as const;

/* ---------------------------------------------------------------------- */
/* Act four: the same report, as each tool shows it. Full frame, native.   */

export const DEST = {
  from: s(29.2),
  linear: s(29.2),
  slack: s(31.0),
  gmail: s(32.8),
  /** The four marks with their green ticks. */
  row: s(34.6),
  /** Frames of cross-dissolve between screens. */
  xfade: 10,
} as const;

/** The order the ticks land in on the delivered row. */
export const DELIVERED: readonly ("github" | "linear" | "slack" | "gmail")[] = ["github", "linear", "slack", "gmail"];
export const DELIVERED_STAGGER = 6;

/** The whip from the destinations to the agent's terminal. */
export const WHIP2 = { from: s(36.4), to: s(37.0) };

/* ---------------------------------------------------------------------- */
/* Act five: an agent picks the ticket up and ships the fix.               */

export const AGENT = {
  window: s(36.9),
  /** The command is typed character by character between these frames. */
  typeFrom: s(37.1),
  typeTo: s(38.2),
  lines: [s(38.5), s(38.9), s(39.6), s(40.3), s(40.5), s(40.7), s(40.9), s(41.7), s(42.5)] as readonly number[],
  prCard: s(43.1),
  closed: s(44.1),
} as const;

export const AGENT_COMMAND = 'claude "take brainbox issue #482"';

/** Where each sound sits. The voice note is the end-user speaking; every
 *  other sound is tied to the motion it confirms. */
export const AUDIO = {
  impact: HOOK.headline,
  voice: s(11.9),
  voiceFrames: s(5.9),
  whoosh: s(18.35),
  land: s(19.2),
  whoosh2: s(36.35),
  terminal: s(36.9),
  pr: s(43.1),
} as const;

/** The music bed: quiet, ducked under the voice note, out before the end. */
export const BED = {
  level: 0.22,
  ducked: 0.08,
  fadeIn: 24,
  fadeOut: 50,
} as const;

/** A panel opening: chooser, composer. */
export const PANEL_OPENS: readonly number[] = [s(6.35), s(11.0)];

export const END = {
  fadeIn: s(46.6),
  mark: s(47.2),
  line: s(48.0),
  icons: s(48.8),
  url: s(49.8),
} as const;

export function sceneAt(frame: number): Scene | undefined {
  return SCENES.find((sc) => frame >= sc.from && frame < sc.to);
}

/** Overlapping captions would stack on screen; the test keeps that impossible. */
export function overlappingCaptions(captions: readonly Caption[]): [Caption, Caption][] {
  const out: [Caption, Caption][] = [];
  for (let i = 0; i < captions.length; i++) {
    for (let j = i + 1; j < captions.length; j++) {
      const a = captions[i];
      const b = captions[j];
      if (a && b && a.from < b.to && b.from < a.to) out.push([a, b]);
    }
  }
  return out;
}

/** The bed's volume at a frame: in, under the voice, out. */
export function bedVolume(frame: number): number {
  const fadeIn = Math.min(1, Math.max(0, frame / BED.fadeIn));
  const fadeOut = Math.min(1, Math.max(0, (DURATION - frame) / BED.fadeOut));
  const duckIn = Math.min(1, Math.max(0, (frame - (AUDIO.voice - 12)) / 12));
  const duckOut = Math.min(1, Math.max(0, (frame - (AUDIO.voice + AUDIO.voiceFrames)) / 18));
  const duck = Math.max(0, duckIn - duckOut);
  const level = BED.level + (BED.ducked - BED.level) * duck;
  return level * fadeIn * fadeOut;
}
