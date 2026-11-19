/**
 * The two Reels as numbers: beats, captions, taps and where every block sits
 * on the 1080×1920 frame. Built for the phone, not reframed from the film.
 * `reels.test.ts` keeps text out from under Instagram's own UI and gives
 * every caption reading time.
 *
 * 30 fps, like the film.
 */

export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_FPS = 30;

/** Seconds → frames. */
export const f = (seconds: number): number => Math.round(seconds * REEL_FPS);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where Instagram draws nothing over the Reel. Its header covers the top,
 * the like/comment/share rail the right edge, and the caption, audio bar and
 * nav the bottom. Published figures disagree (280 to 480 px at the bottom);
 * this takes the cautious end of each.
 */
export const SAFE: Rect = { x: 60, y: 250, w: 900, h: 1190 };

/** Where each block sits. Components read these; the test checks them. */
export const LAYOUT = {
  /** Reel 1: the "it's broken" thread, stacked at the top of the safe area. */
  notes: { x: 80, y: 300, w: 860, h: 3 * 132 + 2 * 18 },
  /** Reel 1: the headline, under the thread. */
  headline: { x: 80, y: 820, w: 860, h: 420 },
  /** Both: one caption at a time, above the phone or the ticket. */
  caption: { x: 80, y: 262, w: 860, h: 170 },
  /** Reel 1: the phone the end-user is holding. */
  phone: { x: 266, y: 446, w: 488, h: 993 },
  /** Reel 1: what the camera on the phone may show. It pushes in about the
   *  bottom centre, so the top of the phone leaves through the top edge. */
  phoneView: { x: 60, y: 432, w: 900, h: 1008 },
  /** Reel 1: the ticket after the whip. */
  ticket: { x: 80, y: 446, w: 860, h: 990 },
  /** Reel 2: the message, alone, in the middle. */
  saidAlone: { x: 80, y: 700, w: 860, h: 300 },
  /** Reel 2: the message once the ticket arrives, at the top. */
  saidTop: { x: 80, y: 270, w: 860, h: 190 },
  /** Reel 2: "WHAT YOU NEEDED", between the two. */
  neededKicker: { x: 80, y: 448, w: 860, h: 34 },
  /** Reel 2: the ticket under it. */
  ticketLow: { x: 80, y: 496, w: 860, h: 940 },
  /** Both: the last line and the URL. */
  end: { x: 80, y: 700, w: 860, h: 420 },
} as const satisfies Record<string, Rect>;

export interface Beat {
  from: number;
  to: number;
  text: string;
  sub?: string;
}

/* ---------------------------------------------------------------------- */
/* Reel 1: "That's the whole bug report." The thread, then the same bug    */
/* through the widget on a phone, then the ticket.                         */

/** The phone screen, in its own CSS pixels (an iPhone's 390 wide). */
export const SCREEN = { w: 390, h: 818 };

/** Where things are on the phone screen. The checkout is laid out absolutely
 *  from these, so the taps land on what they press. */
export const MOBILE = {
  payNow: { x: 24, y: 490, w: 342, h: 52 },
  launcher: { x: 350, y: 770 },
  /** The chooser's Screenshot row. */
  screenshot: { x: 195, y: 656 },
  /** The box the end-user draws round Pay now. */
  boxFrom: { x: 12, y: 478 },
  boxTo: { x: 378, y: 554 },
  next: { x: 306, y: 760 },
  mic: { x: 56, y: 670 },
  send: { x: 195, y: 760 },
} as const;

export const R1 = {
  notes: [f(0.07), f(0.47), f(0.87)] as readonly number[],
  headline: f(1.4),
  sub: f(1.8),
  /** The thread steps back and the phone rises. */
  turn: f(2.8),
  phoneIn: f(3.0),
  phoneFrames: 16,
  taps: {
    payNow1: f(3.6),
    payNow2: f(4.0),
    launcher: f(4.7),
    screenshot: f(5.2),
    boxStart: f(5.55),
    boxEnd: f(6.15),
    next: f(6.5),
    mic: f(6.9),
    send: f(8.3),
  },
  /** The phone whips away and the ticket takes the frame. */
  whip: { from: f(8.5), to: f(8.95) },
  /** The camera on the phone: it pushes in once the widget opens, holding
   *  the bottom of the phone (where the widget's sheets are) in place. */
  camera: [
    { frame: f(3.0), scale: 1 },
    { frame: f(4.55), scale: 1 },
    { frame: f(5.0), scale: 1.32 },
    { frame: f(8.5), scale: 1.32 },
  ] as readonly { frame: number; scale: number }[],
  ticket: {
    title: f(9.0),
    image: f(9.45),
    voice: f(9.9),
    details: f(10.35),
    errors: f(11.0),
  },
  end: f(12.9),
  /** The last frames go to black so the loop back to frame one is a cut
   *  between two dark frames, not a jump. */
  fadeOut: f(14.4),
  duration: f(14.8),
} as const;

export const R1_CAPTIONS: readonly Beat[] = [
  { from: f(2.9), to: f(4.6), text: "Same bug. With Brainbox." },
  { from: f(4.7), to: f(6.8), text: "Tap. Circle what broke." },
  { from: f(6.85), to: f(8.5), text: "Say it.", sub: "“I hit Pay now and nothing happens.”" },
  { from: f(9.0), to: f(10.9), text: "A ticket writes itself." },
  { from: f(11.0), to: f(12.8), text: "Nothing left to ask them." },
];

/** Every tap, for the ripple and the click sound. */
export const R1_TAPS: readonly { frame: number; at: { x: number; y: number } }[] = [
  { frame: R1.taps.payNow1, at: { x: 230, y: 516 } },
  { frame: R1.taps.payNow2, at: { x: 236, y: 518 } },
  { frame: R1.taps.launcher, at: MOBILE.launcher },
  { frame: R1.taps.screenshot, at: MOBILE.screenshot },
  { frame: R1.taps.boxStart, at: MOBILE.boxFrom },
  { frame: R1.taps.next, at: MOBILE.next },
  { frame: R1.taps.mic, at: MOBILE.mic },
  { frame: R1.taps.send, at: MOBILE.send },
];

/* ---------------------------------------------------------------------- */
/* Reel 2: "What they sent vs what you needed." One line, then the ticket. */

export const R2 = {
  kicker: f(0.0),
  said: f(0.1),
  /** The line moves to the top and the ticket starts building under it. */
  move: f(1.9),
  moveFrames: 14,
  needed: f(2.3),
  ticket: {
    title: f(2.5),
    image: f(3.0),
    voice: f(3.6),
    details: f(4.2),
    errors: f(4.9),
  },
  end: f(7.6),
  fadeOut: f(9.6),
  duration: f(10.0),
} as const;

/** Frames between rows of the details table, and lines of the errors. */
export const ROW_STAGGER = 4;
export const LINE_STAGGER = 6;

/** Overlapping beats would stack on screen. */
export function overlapping(beats: readonly Beat[]): [Beat, Beat][] {
  const out: [Beat, Beat][] = [];
  for (let i = 0; i < beats.length; i++) {
    for (let j = i + 1; j < beats.length; j++) {
      const a = beats[i];
      const b = beats[j];
      if (a && b && a.from < b.to && b.from < a.to) out.push([a, b]);
    }
  }
  return out;
}

export function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** A phone-screen point on the Reel frame. */
export function onReel(p: { x: number; y: number }): { x: number; y: number } {
  const k = phoneScale();
  return { x: LAYOUT.phone.x + PHONE_BEZEL + p.x * k, y: LAYOUT.phone.y + PHONE_BEZEL + p.y * k };
}

/** The phone's bezel, in Reel pixels. */
export const PHONE_BEZEL = 14;

/** Reel pixels per phone-screen pixel. */
export function phoneScale(): number {
  return (LAYOUT.phone.w - 2 * PHONE_BEZEL) / SCREEN.w;
}

/** The camera's zoom on the phone at a frame, eased between keys. */
export function phoneZoom(frame: number): number {
  const keys = R1.camera;
  const first = keys[0];
  if (!first || frame <= first.frame) return first?.scale ?? 1;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (frame <= b.frame) {
      const t = (frame - a.frame) / (b.frame - a.frame);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      return a.scale + (b.scale - a.scale) * e;
    }
  }
  return keys[keys.length - 1]?.scale ?? 1;
}
