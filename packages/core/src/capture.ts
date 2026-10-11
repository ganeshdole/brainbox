import { loadRasteriser } from "./lazy.ts";
import { paintMarks, type Mark } from "./marks.ts";

/** Never rendered, so never worth cloning or serialising - big inline <script>
 *  blobs and unmounted <template> markup are pure capture cost. <style> stays:
 *  the clone still needs its rules. */
const INVISIBLE = new Set(["SCRIPT", "NOSCRIPT", "TEMPLATE"]);

/** A stalled asset must not hold the report hostage - well under the 30s default. */
const ASSET_TIMEOUT_MS = 6000;

const MAX_SCALE = 2;

/** The whole document is rasterised before the viewport crop; keep that canvas
 *  under the smallest browser limit (Safari's 16.7M pixels). */
const MAX_CANVAS_PIXELS = 16_777_216;

/** `@brainbox/server`'s default screenshot cap. */
export const SCREENSHOT_BUDGET_BYTES = 5 * 1024 * 1024;

export function captureScale(devicePixelRatio: number, documentPixels: number): number {
  if (!Number.isFinite(devicePixelRatio)) return 1;
  const fit = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(documentPixels, 1));
  return Math.max(1, Math.min(devicePixelRatio, MAX_SCALE, fit));
}

export function overBudget(bytes: number, pixelWidth: number, cssWidth: number): boolean {
  return bytes > SCREENSHOT_BUDGET_BYTES && pixelWidth > cssWidth;
}

/** Positions that lay a box out against an ancestor rather than its parent, so a
 *  descendant can paint far outside the subtree it lives in. */
const ESCAPES = new Set(["absolute", "fixed", "sticky"]);

/**
 * A `filter` that drops everything outside the viewport.
 *
 * We rasterise the whole document and then crop to the viewport, so on a long
 * page most of that work is discarded - a page 4x the viewport pays 4x for one
 * screenshot, and the cost is CPU-bound cloning and per-node style resolution,
 * not pixels. Off-screen elements cannot affect a viewport crop, so skipping
 * them in the clone is free.
 *
 * The exception is escaping descendants: an absolutely positioned child is laid
 * out against an ancestor, so pruning a parent by its own box could drop a child
 * that was actually on screen. Ancestors of any escaping element are kept whole
 * and everything else is judged on its own box.
 *
 * `exclude` (the UI's own host) is dropped from the clone outright, which is
 * what keeps its chrome out of the shot - the live page never has to hide it.
 */
export function viewportFilter(exclude?: HTMLElement): (node: Node) => boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const keepWhole = new Set<Element>();
  for (const el of Array.from(document.querySelectorAll("*"))) {
    if (!ESCAPES.has(getComputedStyle(el).position)) continue;
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (keepWhole.has(p)) break;
      keepWhole.add(p);
    }
  }

  return (node) => {
    if (!(node instanceof Element)) return true;
    if (node === exclude) return false;
    if (INVISIBLE.has(node.tagName)) return false;
    if (keepWhole.has(node)) return true;
    return keepForViewport(node.getBoundingClientRect(), vw, vh);
  };
}

/** Whether a box can still affect a viewport-sized crop. Split out from the DOM
 *  walk so the edge cases are unit-testable. */
export function keepForViewport(
  r: { top: number; bottom: number; left: number; right: number; width: number; height: number },
  vw: number,
  vh: number,
): boolean {
  // A zero-size box says nothing useful - keep it and judge its children on
  // their own boxes.
  if (r.width === 0 && r.height === 0) return true;
  return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
}

/** What to leave out of a screenshot. */
export interface CaptureOptions {
  /** Left out of the cloned page, so the UI's own chrome never appears in the
   *  shot (ADR 0001). It stays visible on the live page throughout: hiding it
   *  would blank the UI for the seconds a capture takes. */
  exclude?: HTMLElement;
}

/** Resolve after the next frame has painted, so UI shown just before a capture
 *  is on screen before the capture's synchronous work blocks the main thread. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** modern-screenshot skips cross-origin sheets it can't read (e.g. Google Fonts)
 *  but fetches `@import`s, so re-declare them as imports to keep their fonts. */
export function unreadableSheetImports(
  sheets: Iterable<{ href: string | null; readonly cssRules: unknown }>,
): string {
  const imports: string[] = [];
  for (const sheet of sheets) {
    if (!sheet.href) continue;
    try {
      void sheet.cssRules;
    } catch {
      imports.push(`@import url(${JSON.stringify(sheet.href)});`);
    }
  }
  return imports.join("\n");
}

export async function withReadableFonts<T>(
  fn: () => Promise<T>,
  sheets: Iterable<{ href: string | null; readonly cssRules: unknown }> = Array.from(document.styleSheets),
): Promise<T> {
  const css = unreadableSheetImports(sheets);
  if (!css) return fn();
  const style = document.createElement("style");
  style.media = "not all";
  style.textContent = css;
  document.head.appendChild(style);
  try {
    return await fn();
  } finally {
    style.remove();
  }
}

/** Render the current viewport to a canvas. */
async function viewportCanvas({ exclude }: CaptureOptions): Promise<HTMLCanvasElement> {
  const { domToCanvas } = await loadRasteriser();
  await afterPaint();
  const box = document.documentElement.getBoundingClientRect();
  const scale = captureScale(window.devicePixelRatio, box.width * box.height);
  const full = await withReadableFonts(() =>
    domToCanvas(document.documentElement, {
      scale,
      timeout: ASSET_TIMEOUT_MS,
      filter: viewportFilter(exclude),
      // Every @font-face in the host's CSS is fetched and inlined; on a
      // font-heavy page that dominates capture time. One modern format is
      // enough - a host serving only legacy formats falls back to system fonts
      // in the shot, which is an acceptable trade for a bug screenshot.
      font: { preferredFormat: "woff2" },
      features: { copyScrollbar: false },
    }),
  );

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = document.createElement("canvas");
  out.width = Math.round(vw * scale);
  out.height = Math.round(vh * scale);

  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // modern-screenshot renders the element from its origin; crop to the viewport.
  ctx.drawImage(
    full,
    window.scrollX * scale,
    window.scrollY * scale,
    out.width,
    out.height,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

/** Plain viewport shot - the frozen page the user marks up, and the
 *  thumbnail/last-frame of a session recording. */
export async function captureViewport(options: CaptureOptions = {}): Promise<Blob> {
  return encodeWithinBudget(await viewportCanvas(options));
}

/**
 * Flatten the user's markup onto the frozen shot.
 *
 * This runs once, on the way out of the markup step, rather than on every
 * stroke: the marks are vectors until here, so drawing stays instant and
 * undoable and nothing has to re-rasterise the page. Mark coordinates are
 * viewport CSS pixels, scaled to the shot's resolution.
 */
export async function bakeMarks(shot: Blob, marks: Mark[]): Promise<Blob> {
  if (marks.length === 0) return shot;

  const bitmap = await createImageBitmap(shot);
  const out = document.createElement("canvas");
  out.width = bitmap.width;
  out.height = bitmap.height;

  const ctx = out.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const scale = out.width / window.innerWidth;
  ctx.scale(scale, scale);
  paintMarks(ctx, marks);
  return encodeWithinBudget(out);
}

/**
 * Which screenshot actually gets uploaded.
 *
 * Two sources disagree on purpose. `settled` is the last shot that resolved into
 * state - what the composer is already showing - and `pending` is the freshest
 * promise for one. Leaving the markup step swaps `pending` for the *baked* shot
 * while `settled` still holds the plain capture taken before the user drew
 * anything, so preferring `settled` would quietly upload the version with none
 * of their markup on it. The promise wins whenever there is one; `settled` is
 * the fallback for the flows that never had one (a recording's last frame) and
 * for a capture that failed, where the plain shot is better than nothing.
 */
export async function pickScreenshot(
  pending: Promise<Blob> | null,
  settled: Blob | null,
): Promise<Blob | null> {
  if (!pending) return settled;
  return (await pending.catch(() => null)) ?? settled;
}

async function encodeWithinBudget(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await toBlob(canvas);
  const cssWidth = window.innerWidth;
  if (!overBudget(blob.size, canvas.width, cssWidth)) return blob;

  const small = document.createElement("canvas");
  small.width = cssWidth;
  small.height = Math.round((canvas.height * cssWidth) / canvas.width);
  const ctx = small.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return toBlob(small);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Screenshot encoding failed"))),
      "image/png",
    );
  });
}
