import { describe, expect, it } from "vitest";
import {
  AGENT,
  AUDIO,
  BED,
  CAPTIONS,
  CLICK_FRAMES,
  CURSOR,
  DEST,
  DRAGS,
  DURATION,
  HOOK,
  LAUNCHER,
  MESSAGES,
  PAY_NOW,
  SCENES,
  TICKET,
  WHIP,
  WHIP2,
  bedVolume,
  overlappingCaptions,
  sceneAt,
} from "./timeline.ts";

describe("scenes", () => {
  it("are contiguous from frame 0 to the end", () => {
    expect(SCENES[0]?.from).toBe(0);
    for (let i = 1; i < SCENES.length; i++) {
      expect(SCENES[i]?.from).toBe(SCENES[i - 1]?.to);
    }
    expect(DURATION).toBe(SCENES[SCENES.length - 1]?.to);
    expect(sceneAt(DURATION)).toBeUndefined();
    expect(sceneAt(0)?.id).toBe("hook");
  });
});

describe("captions", () => {
  it("never overlap and all fit in the film", () => {
    expect(overlappingCaptions(CAPTIONS)).toEqual([]);
    for (const c of CAPTIONS) {
      expect(c.from).toBeLessThan(c.to);
      expect(c.to).toBeLessThanOrEqual(DURATION);
    }
  });

  it("give every line at least a second and a half of reading time", () => {
    for (const c of CAPTIONS) expect(c.to - c.from).toBeGreaterThanOrEqual(45);
  });
});

describe("cursor", () => {
  it("keyframes are in order and every click lands while the cursor is parked", () => {
    for (let i = 1; i < CURSOR.length; i++) {
      expect(CURSOR[i]!.frame).toBeGreaterThan(CURSOR[i - 1]!.frame);
    }
    for (const click of CLICK_FRAMES.filter((c) => !DRAGS.includes(c))) {
      // A click has to happen on a keyframe hold, not mid-flight.
      const before = [...CURSOR].reverse().find((k) => k.frame <= click);
      const after = CURSOR.find((k) => k.frame > click);
      expect(before, `no keyframe before click at ${click}`).toBeDefined();
      if (before && after) {
        expect({ x: after.x, y: after.y }, `cursor moving during click at ${click}`).toEqual({
          x: before.x,
          y: before.y,
        });
      }
    }
  });
});

describe("ticket", () => {
  it("blocks land in reading order after the whip", () => {
    const order = [
      TICKET.page,
      TICKET.title,
      TICKET.image,
      TICKET.voice,
      TICKET.table,
      TICKET.errors,
      TICKET.footer,
      TICKET.zoomIn,
      TICKET.zoomOut,
    ];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
    expect(TICKET.page).toBeGreaterThanOrEqual(WHIP.from);
  });
});

describe("stage anchors", () => {
  it("match the measured layout of the rendered checkout", () => {
    // Measured off a rendered frame: button y 590..637 at x 736..1183; launcher y 985..1031.
    expect(PAY_NOW.y).toBe(613);
    expect(PAY_NOW.x).toBe(960);
    expect(LAUNCHER).toEqual({ x: 1848, y: 1008 });
  });
});

describe("hook", () => {
  it("has motion on the first frames, lands the headline after the thread, and pushes through after that", () => {
    expect(HOOK.bubbles).toHaveLength(MESSAGES.length);
    for (let i = 1; i < HOOK.bubbles.length; i++) expect(HOOK.bubbles[i]).toBeGreaterThan(HOOK.bubbles[i - 1]!);
    // The first notification is already sliding in within the first half second: that is the thumbnail.
    expect(HOOK.bubbles[0]).toBeLessThanOrEqual(15);
    expect(HOOK.headline).toBeGreaterThan(HOOK.bubbles[HOOK.bubbles.length - 1]!);
    expect(HOOK.sub).toBeGreaterThan(HOOK.headline);
    expect(HOOK.out).toBeGreaterThan(HOOK.sub);
    // The hook has paid off and the story has started well inside ten seconds.
    expect(HOOK.out + HOOK.outFrames).toBeLessThanOrEqual(10 * 30);
  });
});

describe("destinations", () => {
  it("show each tool in turn, then the marks, before the whip to the agent", () => {
    const order = [DEST.linear, DEST.slack, DEST.gmail, DEST.row, WHIP2.from];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
    expect(DEST.from).toBe(DEST.linear);
    // Every screen gets at least a second and a half; the cross-dissolve is shorter than any of them.
    for (let i = 1; i < order.length; i++) expect(order[i]! - order[i - 1]!).toBeGreaterThanOrEqual(45);
    expect(DEST.xfade).toBeLessThan(45);
  });
});

describe("agent", () => {
  it("types first, then prints in order, then opens the PR and closes the issue", () => {
    expect(AGENT.typeFrom).toBeGreaterThan(AGENT.window);
    expect(AGENT.lines[0]).toBeGreaterThan(AGENT.typeTo);
    for (let i = 1; i < AGENT.lines.length; i++) expect(AGENT.lines[i]).toBeGreaterThan(AGENT.lines[i - 1]!);
    expect(AGENT.prCard).toBeGreaterThan(AGENT.lines[AGENT.lines.length - 1]!);
    expect(AGENT.closed).toBeGreaterThan(AGENT.prCard);
  });
});

describe("music bed", () => {
  it("fades in, ducks under the voice note, and is out by the last frame", () => {
    expect(bedVolume(0)).toBe(0);
    expect(bedVolume(BED.fadeIn)).toBeCloseTo(BED.level, 5);
    expect(bedVolume(AUDIO.voice + 10)).toBeCloseTo(BED.ducked, 5);
    expect(bedVolume(AUDIO.voice + AUDIO.voiceFrames + 40)).toBeCloseTo(BED.level, 5);
    expect(bedVolume(DURATION)).toBe(0);
    for (let f = 0; f <= DURATION; f += 7) {
      expect(bedVolume(f)).toBeGreaterThanOrEqual(0);
      expect(bedVolume(f)).toBeLessThanOrEqual(BED.level);
    }
  });
});
