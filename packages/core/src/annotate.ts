import {
  arrowHead,
  penPath,
  translateMark,
  FONT_STACK,
  STROKE_WIDTH,
  TEXT_HALO,
  TEXT_HALO_WIDTH,
  TEXT_SIZE,
  type Mark,
  type Point,
} from "./marks.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/** `position` values that make an element a containing block for `absolute`
 *  descendants. Anything else - including jsdom's empty string for an unset
 *  property - leaves the document as the containing block. */
const POSITIONED = new Set(["relative", "absolute", "fixed", "sticky"]);

/** Marks drawn into the host page during a recording. One set per recording,
 *  so cancelling one cannot wipe another's and nothing outlives `clear()`. */
export interface Annotations {
  /** Put a mark on the page. */
  show(m: Mark): void;
  /** Remove the most recent mark. Returns whether there was one to remove. */
  undo(): boolean;
  /** How many marks are currently on the page. */
  count(): number;
  /** Remove every mark immediately (cleared by the user, or the recording
   *  stopped or was cancelled). */
  clear(): void;
}

/** One mark as SVG built with the DOM API rather than React.
 *  It has to live in the host document (see `showMark`), which React isn't
 *  rendering, so this mirrors `MarkShape` node for node. */
function shapeFor(m: Mark): SVGElement {
  const el = (tag: string, attrs: Record<string, string | number>): SVGElement => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
  };

  switch (m.kind) {
    case "box":
      return el("rect", {
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        fill: "none",
        stroke: m.color,
        "stroke-width": STROKE_WIDTH,
      });

    case "arrow": {
      const [tip, left, right] = arrowHead(m);
      const g = el("g", {});
      g.appendChild(
        el("line", {
          x1: m.x1,
          y1: m.y1,
          x2: m.x2,
          y2: m.y2,
          stroke: m.color,
          "stroke-width": STROKE_WIDTH,
          "stroke-linecap": "round",
        }),
      );
      g.appendChild(
        el("polygon", {
          points: `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`,
          fill: m.color,
        }),
      );
      return g;
    }

    case "pen":
      return el("path", {
        d: penPath(m),
        fill: "none",
        stroke: m.color,
        "stroke-width": STROKE_WIDTH,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });

    case "text": {
      const t = el("text", {
        x: m.x,
        y: m.y,
        fill: m.color,
        stroke: TEXT_HALO,
        "stroke-width": TEXT_HALO_WIDTH,
        "paint-order": "stroke",
        "font-size": TEXT_SIZE,
        "font-weight": 700,
        "font-family": FONT_STACK,
      });
      t.textContent = m.text;
      return t;
    }
  }
}

/**
 * Marks go on the host page itself (NOT the shadow DOM).
 *
 * The shadow host is `rr-block`ed so the widget's own chrome stays out of
 * recordings; putting the mark in the host document instead means rrweb sees
 * it as ordinary mutations and it replays in the dashboard with no
 * replay-side support at all.
 *
 * Marks are anchored to the **document**, not the viewport, and they stay
 * until the user clears them. An earlier version expired them after three
 * seconds, which was the wrong answer to a real problem: a viewport-anchored
 * mark starts pointing at whatever slid underneath it the moment the page
 * scrolls. Converting to document coordinates fixes that properly - the mark
 * rides the content it was drawn on - so there's nothing left for a timer to
 * protect against, and the user gets to keep an annotation on screen for as
 * long as they're still talking about it.
 */
export function createAnnotations(): Annotations {
  /** Marks currently on the page, oldest first. */
  const live: SVGSVGElement[] = [];

  return {
    show(m) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("data-brainbox-highlight", "");
      svg.setAttribute("aria-hidden", "true");
      // Zero-sized with overflow visible: the shapes carry absolute document
      // coordinates, so the container only has to establish the origin.
      svg.setAttribute(
        "style",
        "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;" +
          "pointer-events:none;z-index:2147483646;",
      );
      document.body.appendChild(svg);

      // Measured while the container is still childless, so what comes back is
      // its own 0x0 box rather than the ink bounds of a shape overflowing it.
      const origin = originOffset(svg);
      svg.appendChild(
        shapeFor(translateMark(m, window.scrollX - origin.x, window.scrollY - origin.y)),
      );
      live.push(svg);
    },
    undo() {
      const last = live.pop();
      last?.remove();
      return !!last;
    },
    count: () => live.length,
    clear() {
      for (const el of live) el.remove();
      live.length = 0;
    },
  };
}

/**
 * How far the container's own origin sits from the document origin.
 *
 * `position:absolute` resolves against the nearest **positioned** ancestor, not
 * the document. Usually nothing between the container and the root is
 * positioned, the containing block is the document, and this is (0, 0) - but a
 * host page with `body { position: relative }` (common enough to plan for) makes
 * the body the containing block, and every mark lands offset by wherever the
 * body's padding box starts. Measuring covers the margin, border and padding
 * that put it there without having to enumerate them.
 *
 * Only the offset is corrected. A transformed `<body>` would also scale or
 * rotate the marks, which no amount of translation fixes - and which the old
 * `position:fixed` container got wrong too.
 */
function originOffset(container: Element): Point {
  if (!POSITIONED.has(getComputedStyle(document.body).position)) return { x: 0, y: 0 };
  const r = container.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY };
}
