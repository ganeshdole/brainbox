import { Easing, interpolate, spring } from "remotion";
import { CURSOR, type CursorKey } from "./timeline.ts";

/** Fast-out, no overshoot: the way panels open in the widget. */
export const EASE_OUT = Easing.out(Easing.cubic);
export const EASE_IN_OUT = Easing.inOut(Easing.cubic);

/** 0→1 over `frames` starting at `from`, clamped. */
export function ramp(frame: number, from: number, frames: number, easing = EASE_OUT): number {
  return interpolate(frame, [from, from + frames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** A settle-without-bounce spring for things that pop in (panels, rows). */
export function pop(frame: number, fps: number, from: number): number {
  if (frame < from) return 0;
  return spring({ frame: frame - from, fps, config: { damping: 200, stiffness: 170, mass: 0.8 } });
}

/** Cursor position at a frame, eased between neighbouring keyframes. */
export function cursorAt(frame: number, keys: readonly CursorKey[] = CURSOR): { x: number; y: number } {
  const first = keys[0];
  if (!first) return { x: 0, y: 0 };
  if (frame <= first.frame) return { x: first.x, y: first.y };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (frame <= b.frame) {
      const t = ramp(frame, a.frame, b.frame - a.frame, EASE_IN_OUT);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const last = keys[keys.length - 1] ?? first;
  return { x: last.x, y: last.y };
}
