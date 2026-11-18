import { renderTicket, type Ticket } from "@ganeshdole/brainbox-integrations";
import { describe, expect, it } from "vitest";
import { EPISODES, type Episode, titleOf } from "./episodes.ts";
import {
  type Beat,
  LAYOUT,
  MOBILE,
  R1,
  R1_CAPTIONS,
  R1_TAPS,
  R2,
  REEL_FPS,
  SAFE,
  SCREEN,
  f,
  inside,
  onReel,
  overlapping,
  phoneZoom,
} from "./timing.ts";

/** The report an episode stands for, as the backend hands it to a destination. */
function reportOf(ep: Episode): Ticket {
  return {
    id: `ep-${ep.id}`,
    createdAt: "2026-11-01T10:00:00.000Z",
    transcript: ep.transcript,
    metadata: {
      url: ep.page.url,
      title: ep.page.title,
      viewport: { width: ep.viewport.width, height: ep.viewport.height },
      devicePixelRatio: ep.viewport.dpr,
      userAgent: ep.browser,
      language: "en-GB",
      timezone: "Europe/London",
      selector: ep.selector,
      consoleErrors: [...ep.consoleErrors],
    },
    links: { dashboard: "https://app.brainbox.sh/issues/1", crop: "https://files.brainbox.sh/crop.png" },
  };
}

describe("reel layout", () => {
  it("keeps every block out from under Instagram's header, rail and caption", () => {
    for (const [name, rect] of Object.entries(LAYOUT)) {
      expect(inside(rect, SAFE), `${name} leaves the safe area`).toBe(true);
    }
  });

  it("keeps the phone inside the safe area at its closest push", () => {
    const max = Math.max(...R1.camera.map((k) => k.scale));
    const p = LAYOUT.phone;
    // Zoomed about its bottom centre: the sides spread evenly, the bottom stays put.
    const cx = p.x + p.w / 2;
    expect(cx - (p.w * max) / 2).toBeGreaterThanOrEqual(SAFE.x);
    expect(cx + (p.w * max) / 2).toBeLessThanOrEqual(SAFE.x + SAFE.w);
    expect(phoneZoom(0)).toBe(1);
    expect(phoneZoom(R1.whip.from)).toBe(max);
  });

  it("puts every tap on the phone screen, and on the phone on the Reel", () => {
    for (const tap of R1_TAPS) {
      expect(tap.at.x).toBeGreaterThanOrEqual(0);
      expect(tap.at.x).toBeLessThanOrEqual(SCREEN.w);
      expect(tap.at.y).toBeGreaterThanOrEqual(0);
      expect(tap.at.y).toBeLessThanOrEqual(SCREEN.h);
      const on = onReel(tap.at);
      expect(inside({ ...on, w: 0, h: 0 }, LAYOUT.phone)).toBe(true);
    }
    // The Pay now taps land on the button.
    const pay = MOBILE.payNow;
    for (const tap of R1_TAPS.slice(0, 2)) {
      expect(tap.at.x).toBeGreaterThan(pay.x);
      expect(tap.at.x).toBeLessThan(pay.x + pay.w);
      expect(tap.at.y).toBeGreaterThan(pay.y);
      expect(tap.at.y).toBeLessThan(pay.y + pay.h);
    }
  });
});

function readable(beats: readonly Beat[], duration: number) {
  expect(overlapping(beats)).toEqual([]);
  for (const b of beats) {
    expect(b.to - b.from, `"${b.text}" is on screen too briefly`).toBeGreaterThanOrEqual(f(1.2));
    expect(b.to).toBeLessThanOrEqual(duration);
  }
}

const ascending = (xs: readonly number[]) => {
  for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]!);
};

describe("reel 1: that's the whole bug report", () => {
  it("moves on frame one, makes its point inside two seconds, and is short enough to loop", () => {
    ascending(R1.notes);
    expect(R1.notes[0]).toBeLessThanOrEqual(3);
    expect(R1.headline).toBeGreaterThan(R1.notes[R1.notes.length - 1]!);
    expect(R1.headline).toBeLessThanOrEqual(f(2));
    expect(R1.duration).toBeGreaterThanOrEqual(f(8));
    expect(R1.duration).toBeLessThanOrEqual(f(20));
  });

  it("runs the widget in order on the phone, then whips to the ticket", () => {
    const taps = R1_TAPS.map((t) => t.frame);
    ascending(taps);
    expect(taps[0]).toBeGreaterThan(R1.phoneIn + R1.phoneFrames);
    expect(R1.whip.from).toBeGreaterThan(R1.taps.send);
    const t = R1.ticket;
    ascending([R1.whip.to, t.title, t.image, t.voice, t.details, t.errors, R1.end, R1.fadeOut, R1.duration]);
  });

  it("gives every caption reading time", () => readable(R1_CAPTIONS, R1.duration));
});

describe("reel 2: what they sent vs what you needed", () => {
  it("leaves the line alone long enough to read, then builds the ticket under it", () => {
    expect(R2.said).toBeLessThanOrEqual(3);
    expect(R2.move - R2.said).toBeGreaterThanOrEqual(f(1.5));
    const t = R2.ticket;
    ascending([R2.move, R2.needed, t.title, t.image, t.voice, t.details, t.errors, R2.end, R2.fadeOut, R2.duration]);
    // The finished ticket holds long enough to take in before the end line.
    expect(R2.end - t.errors).toBeGreaterThanOrEqual(f(2));
    expect(R2.duration).toBeLessThanOrEqual(f(15));
    expect(REEL_FPS).toBe(30);
  });
});

describe("episodes", () => {
  it("have ids a composition can use, and lead with one of their own messages", () => {
    const ids = EPISODES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ep of EPISODES) {
      expect(ep.id).toMatch(/^[a-z-]+$/);
      expect(ep.messages).toContain(ep.said);
    }
  });

  it("show the ticket renderTicket() writes for the same report", () => {
    for (const ep of EPISODES) {
      const { title, body } = renderTicket(reportOf(ep));
      expect(titleOf(ep)).toBe(title);
      // A whole sentence on screen, not one the renderer had to cut.
      expect(title.endsWith("…"), `${ep.id}: title is truncated`).toBe(false);
      expect(body).toContain(ep.transcript);
      expect(body).toContain(ep.selector);
      for (const e of ep.consoleErrors) expect(body).toContain(e);
      expect(body).toContain(`${ep.consoleErrors.length} console error`);
    }
  });
});
