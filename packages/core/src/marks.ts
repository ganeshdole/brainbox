/**
 * The end-user's markup: boxes, arrows, freehand strokes and text they drew on
 * the frozen page before sending.
 *
 * Marks are kept as **vectors**, not pixels. Drawing stays instant and undoable
 * while the (slow) rasterise runs in the background, and the bake onto the
 * screenshot happens once, at the end - see `bakeMarks` in `capture.ts`.
 *
 * All coordinates are CSS pixels relative to the viewport at freeze time, which
 * is the same space the screenshot is cropped to, so baking is 1:1 with no
 * scaling.
 */

export type Tool = "select" | "box" | "arrow" | "pen" | "text";

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MarkBase {
  id: string;
  color: string;
}

export interface BoxMark extends MarkBase, Box {
  kind: "box";
}

export interface ArrowMark extends MarkBase {
  kind: "arrow";
  /** Tail - where the drag started. */
  x1: number;
  y1: number;
  /** Head - where the arrow points. */
  x2: number;
  y2: number;
}

export interface PenMark extends MarkBase {
  kind: "pen";
  points: Point[];
}

export interface TextMark extends MarkBase {
  kind: "text";
  /** Left edge / text baseline. */
  x: number;
  y: number;
  text: string;
}

export type Mark = BoxMark | ArrowMark | PenMark | TextMark;

export const DEFAULT_COLOR = "#ff4d4f";
export const MARK_COLORS: readonly string[] = [
  DEFAULT_COLOR,
  "#faad14",
  "#52c41a",
  "#1677ff",
  "#ffffff",
];

/** Next colour in the palette, wrapping - what the `c` shortcut cycles through
 *  so a colour change never has to cost a trip to the toolbar. */
export function nextColor(current: string): string {
  const i = MARK_COLORS.indexOf(current);
  return MARK_COLORS[(i + 1) % MARK_COLORS.length] ?? DEFAULT_COLOR;
}

export const STROKE_WIDTH = 3;
export const TEXT_SIZE = 16;
/** Halo behind text so it stays readable over a busy screenshot - the single
 *  detail that separates a real markup tool from a toy one. */
export const TEXT_HALO = "#000000";
export const TEXT_HALO_WIDTH = 4;
/** Named by every renderer rather than inherited. The SVG preview lives inside
 *  the widget's shadow root, where an unset `font-family` falls through to the
 *  *host page's* font - so the text the user places would be a different face,
 *  and a different width, from the one baked into the PNG. */
export const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const ARROW_HEAD = 14;

/** A drag shorter than this in both axes is a stray click, not a shape. */
const MIN_DRAG = 6;

/** Rect between two drag corners, normalised so width/height are never negative
 *  (dragging up-left is as valid as down-right). */
export function normalizeBox(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Rough width of a text mark. Canvas `measureText` would be exact but needs a
 *  context; this only feeds hit-testing and the region bounds, where a few
 *  pixels either way don't matter. */
function textWidth(text: string): number {
  return text.length * TEXT_SIZE * 0.58;
}

/** Axis-aligned bounds of a single mark. */
export function boundsOf(m: Mark): Box {
  switch (m.kind) {
    case "box":
      return { x: m.x, y: m.y, width: m.width, height: m.height };
    case "arrow":
      return normalizeBox({ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });
    case "text":
      return {
        x: m.x,
        y: m.y - TEXT_SIZE,
        width: textWidth(m.text),
        height: TEXT_SIZE * 1.3,
      };
    case "pen": {
      const first = m.points[0];
      if (!first) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = first.x;
      let minY = first.y;
      let maxX = first.x;
      let maxY = first.y;
      for (const p of m.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
  }
}

/** The same mark shifted by (dx, dy).
 *
 *  Marks are drawn in viewport coordinates, which is what the pointer gives us
 *  and what the screenshot is cropped to. A mark that outlives the moment it
 *  was drawn - one left on the page during a recording - has to be converted to
 *  *document* coordinates instead, or the first scroll leaves it pointing at
 *  whatever slid underneath it. */
export function translateMark(m: Mark, dx: number, dy: number): Mark {
  switch (m.kind) {
    case "box":
      return { ...m, x: m.x + dx, y: m.y + dy };
    case "arrow":
      return { ...m, x1: m.x1 + dx, y1: m.y1 + dy, x2: m.x2 + dx, y2: m.y2 + dy };
    case "text":
      return { ...m, x: m.x + dx, y: m.y + dy };
    case "pen":
      return { ...m, points: m.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
}

/** Bounds covering every mark - this is what becomes the issue's `region`, so
 *  the dashboard still gets "where on the page" without a separate select step. */
export function unionBounds(marks: Mark[]): Box | null {
  const first = marks[0];
  if (!first) return null;
  let box = boundsOf(first);
  for (const m of marks.slice(1)) {
    const b = boundsOf(m);
    const x = Math.min(box.x, b.x);
    const y = Math.min(box.y, b.y);
    box = {
      x,
      y,
      width: Math.max(box.x + box.width, b.x + b.width) - x,
      height: Math.max(box.y + box.height, b.y + b.height) - y,
    };
  }
  return box;
}

/** Id of the topmost mark under a point, or null. Last drawn wins, matching
 *  what the user sees. Bounds-based: precise enough to pick a shape for
 *  delete/move, and predictable in a way per-kind geometry isn't. */
export function hitTest(marks: Mark[], p: Point, pad = 6): string | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (!m) continue;
    const b = boundsOf(m);
    if (
      p.x >= b.x - pad &&
      p.x <= b.x + b.width + pad &&
      p.y >= b.y - pad &&
      p.y <= b.y + b.height + pad
    ) {
      return m.id;
    }
  }
  return null;
}

/** Whether a just-finished mark is too small/empty to keep. */
export function isDegenerate(m: Mark): boolean {
  if (m.kind === "text") return m.text.trim().length === 0;
  if (m.kind === "pen") return m.points.length < 2;
  const b = boundsOf(m);
  return b.width < MIN_DRAG && b.height < MIN_DRAG;
}

/** The three corners of an arrow's head triangle, tip first. */
export function arrowHead(m: ArrowMark, size = ARROW_HEAD): [Point, Point, Point] {
  const angle = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
  const spread = Math.PI / 7;
  return [
    { x: m.x2, y: m.y2 },
    {
      x: m.x2 - size * Math.cos(angle - spread),
      y: m.y2 - size * Math.sin(angle - spread),
    },
    {
      x: m.x2 - size * Math.cos(angle + spread),
      y: m.y2 - size * Math.sin(angle + spread),
    },
  ];
}

/** A freehand stroke as quadratic curves: each raw point becomes a control
 *  point and the curve passes through the midpoints between them. Raw pointer
 *  samples joined by straight lines look visibly faceted on a slow, curved
 *  stroke; this is the cheapest fix that doesn't move the line off the ink. */
export interface PenCurve {
  start: Point;
  /** `c` is the control point, `to` the on-curve end point. */
  segments: { c: Point; to: Point }[];
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function penCurve(points: Point[]): PenCurve | null {
  const start = points[0];
  if (!start) return null;

  const segments: { c: Point; to: Point }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const c = points[i];
    const next = points[i + 1];
    if (!c || !next) continue;
    segments.push({ c, to: mid(c, next) });
  }

  // Land exactly on the last sample so the stroke ends under the cursor.
  const last = points[points.length - 1];
  if (last && points.length > 1) segments.push({ c: last, to: last });

  return { start, segments };
}

/** SVG path data for a freehand stroke. */
export function penPath(m: PenMark): string {
  const curve = penCurve(m.points);
  if (!curve) return "";
  const head = `M${curve.start.x} ${curve.start.y}`;
  return curve.segments.reduce((d, s) => `${d} Q${s.c.x} ${s.c.y} ${s.to.x} ${s.to.y}`, head);
}

/** Drop samples too close to the previous one to matter. A fast drag can emit
 *  hundreds of points per stroke; thinning keeps the path (and the payload)
 *  small with no visible change. */
export function shouldKeepPoint(prev: Point | undefined, next: Point, min = 2): boolean {
  if (!prev) return true;
  return Math.abs(next.x - prev.x) >= min || Math.abs(next.y - prev.y) >= min;
}

/** The slice of a 2D canvas the bake step touches. Narrow on purpose: it keeps
 *  `paintMarks` unit-testable against a stub, with no real canvas in jsdom. */
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "closePath"
  | "moveTo"
  | "lineTo"
  | "quadraticCurveTo"
  | "stroke"
  | "fill"
  | "strokeRect"
  | "strokeText"
  | "fillText"
  | "lineWidth"
  | "strokeStyle"
  | "fillStyle"
  | "font"
  | "lineCap"
  | "lineJoin"
>;

/** Bake every mark onto a canvas, in draw order. */
export function paintMarks(ctx: Canvas2D, marks: Mark[]): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const m of marks) {
    ctx.lineWidth = STROKE_WIDTH;
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;

    switch (m.kind) {
      case "box":
        ctx.strokeRect(m.x, m.y, m.width, m.height);
        break;

      case "arrow": {
        ctx.beginPath();
        ctx.moveTo(m.x1, m.y1);
        ctx.lineTo(m.x2, m.y2);
        ctx.stroke();
        const [tip, left, right] = arrowHead(m);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case "pen": {
        // Same curve the SVG layer draws, so the bake matches what was on
        // screen rather than a straighter version of it.
        const curve = penCurve(m.points);
        if (!curve) break;
        ctx.beginPath();
        ctx.moveTo(curve.start.x, curve.start.y);
        for (const s of curve.segments) ctx.quadraticCurveTo(s.c.x, s.c.y, s.to.x, s.to.y);
        ctx.stroke();
        break;
      }

      case "text":
        ctx.font = `700 ${TEXT_SIZE}px ${FONT_STACK}`;
        // Halo first, fill second - the stroke sits *behind* the glyphs.
        ctx.lineWidth = TEXT_HALO_WIDTH;
        ctx.strokeStyle = TEXT_HALO;
        ctx.strokeText(m.text, m.x, m.y);
        ctx.fillText(m.text, m.x, m.y);
        break;
    }
  }

  ctx.restore();
}
