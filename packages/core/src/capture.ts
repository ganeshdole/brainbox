import { domToCanvas } from "modern-screenshot";
import { paintMarks, type Mark } from "./marks.ts";

/** Never rendered, so never worth cloning or serialising - big inline <script>
 *  blobs and unmounted <template> markup are pure capture cost. <style> stays:
 *  the clone still needs its rules. */
const INVISIBLE = new Set(["SCRIPT", "NOSCRIPT", "TEMPLATE"]);

/** A stalled asset must not hold the report hostage - well under the 30s default. */
const ASSET_TIMEOUT_MS = 6000;

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
 */
function viewportFilter(): (node: Node) => boolean {
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
  /** Hidden for the duration of the capture - the UI's own host element, so
   *  its chrome never appears in the shot (ADR 0001). */
  exclude?: HTMLElement;
}

/** Run `fn` with `el` invisible, then put it back however it was. */
async function whileHidden<T>(el: HTMLElement | undefined, fn: () => Promise<T>): Promise<T> {
  if (!el) return fn();
  const prev = el.style.visibility;
  el.style.visibility = "hidden";
  try {
    return await fn();
  } finally {
    el.style.visibility = prev;
  }
}

/** Render the current viewport to a canvas. */
async function viewportCanvas({ exclude }: CaptureOptions): Promise<HTMLCanvasElement> {
  const full = await whileHidden(exclude, () =>
    domToCanvas(document.documentElement, {
      scale: 1,
      timeout: ASSET_TIMEOUT_MS,
      filter: viewportFilter(),
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
  out.width = vw;
  out.height = vh;

  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // modern-screenshot renders the element from its origin; crop to the viewport.
  ctx.drawImage(full, window.scrollX, window.scrollY, vw, vh, 0, 0, vw, vh);
  return out;
}

/** Plain viewport shot - the frozen page the user marks up, and the
 *  thumbnail/last-frame of a session recording. */
export async function captureViewport(options: CaptureOptions = {}): Promise<Blob> {
  return toBlob(await viewportCanvas(options));
}

/**
 * Flatten the user's markup onto the frozen shot.
 *
 * This runs once, on the way out of the markup step, rather than on every
 * stroke: the marks are vectors until here, so drawing stays instant and
 * undoable and nothing has to re-rasterise the page. Mark coordinates are
 * viewport CSS pixels and the shot is a viewport crop at scale 1, so the two
 * spaces line up with no transform.
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

  paintMarks(ctx, marks);
  return toBlob(out);
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

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Screenshot encoding failed"))),
      "image/png",
    );
  });
}
