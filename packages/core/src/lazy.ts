// The two libraries that make up most of the engine's weight, behind one seam.
//
// Neither is needed until a capture starts, so both load on first use rather
// than with the host page. A bundler host gets them as split chunks from these
// `import()`s; the script-tag build swaps this file for one that fetches a
// sibling script instead (widget/src/lib/load-capture.ts). Keep the two in step.

export const loadRecorder = (): Promise<Pick<typeof import("rrweb"), "record">> => import("rrweb");

export const loadRasteriser = (): Promise<Pick<typeof import("modern-screenshot"), "domToCanvas">> =>
  import("modern-screenshot");

/** Start fetching the capture libraries ahead of a capture - a UI calls this
 *  when it opens, so the first screenshot or recording isn't waiting on the
 *  network. Failures are left for the capture itself to report. */
export function preloadCapture(): void {
  loadRecorder().catch(() => {});
  loadRasteriser().catch(() => {});
}
