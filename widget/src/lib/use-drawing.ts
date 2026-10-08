import { useCallback, useEffect, useRef, useState } from "react";
import { isDegenerate, normalizeBox, shouldKeepPoint, type Mark, type Point } from "@brainbox/core";

/** Tools that are drawn by dragging. `select` and `text` are stateful in ways
 *  that belong to the surface using them, so they stay out of here. */
export type DragTool = "box" | "arrow" | "pen";

export function isDragTool(t: string): t is DragTool {
  return t === "box" || t === "arrow" || t === "pen";
}

let seq = 0;
export const nextMarkId = () => `m${++seq}`;

/**
 * Drag-to-draw, shared by the two surfaces that need it: the markup step and
 * the annotations drawn during a recording. Keeping it in one place is what
 * stops the two from drifting into subtly different feels.
 *
 * The stroke in progress is mutated on a ref and flushed to state once per
 * animation frame. A fast drag fires far more pointer events than the display
 * refreshes, and re-rendering per sample is exactly what makes a drawing
 * surface feel like it's lagging behind the cursor.
 */
export function useDrawing({
  color,
  onCommit,
}: {
  color: string;
  onCommit: (m: Mark) => void;
}): {
  draft: Mark | null;
  begin: (tool: DragTool, e: React.PointerEvent) => void;
  extend: (e: React.PointerEvent) => void;
  finish: () => void;
} {
  const [draft, setDraft] = useState<Mark | null>(null);
  const live = useRef<Mark | null>(null);
  const origin = useRef<Point | null>(null);
  const frame = useRef(0);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setDraft(live.current ? { ...live.current } : null);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const begin = useCallback(
    (tool: DragTool, e: React.PointerEvent) => {
      const p = { x: e.clientX, y: e.clientY };
      // Keeps a drag alive if the pointer leaves the window mid-stroke. Not
      // every pointer can be captured (synthetic events, some pens) and a
      // refusal only costs us the off-screen tail, so it must not throw.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* draw without capture */
      }
      origin.current = p;
      live.current =
        tool === "box"
          ? { kind: "box", id: nextMarkId(), color, ...normalizeBox(p, p) }
          : tool === "arrow"
            ? { kind: "arrow", id: nextMarkId(), color, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
            : { kind: "pen", id: nextMarkId(), color, points: [p] };
      schedule();
    },
    [color, schedule],
  );

  const extend = useCallback(
    (e: React.PointerEvent) => {
      const from = origin.current;
      const d = live.current;
      if (!from || !d) return;

      if (d.kind === "pen") {
        // Coalesced events are the samples the browser took between frames.
        // Reading them is what separates a smooth stroke from a polygon on a
        // fast drag - they cost nothing extra, we just have to ask.
        const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        for (const s of samples) {
          const p = { x: s.clientX, y: s.clientY };
          if (shouldKeepPoint(d.points[d.points.length - 1], p)) d.points.push(p);
        }
      } else {
        const p = { x: e.clientX, y: e.clientY };
        if (d.kind === "box") Object.assign(d, normalizeBox(from, p));
        else if (d.kind === "arrow") Object.assign(d, { x2: p.x, y2: p.y });
      }
      schedule();
    },
    [schedule],
  );

  const finish = useCallback(() => {
    origin.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    const d = live.current;
    live.current = null;
    setDraft(null);
    if (d && !isDegenerate(d)) onCommit(d);
  }, [onCommit]);

  return { draft, begin, extend, finish };
}
