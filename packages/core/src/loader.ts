// The two libraries that make up most of the engine's weight, behind one seam.
//
// Neither is needed until a capture starts, so both load on first use rather
// than with the host page. A bundler host gets them as split chunks from the
// default loader's `import()`s. A host that ships them some other way (a CDN,
// a sibling script, a copy it already bundles) passes its own `CaptureLoader`
// to `createBrainbox()`; the widget's script-tag bundle does exactly that
// (widget/src/lib/load-capture.ts).

import type { domToCanvas } from "modern-screenshot";
import type { record } from "rrweb";

/** How the engine gets rrweb and modern-screenshot. Each is called on every
 *  capture, so a loader that fetches something should cache it, and forget a
 *  failed fetch so the next capture can try again. */
export interface CaptureLoader {
  /** rrweb's `record`, for session recordings. */
  recorder(): Promise<{ record: typeof record }>;
  /** modern-screenshot's `domToCanvas`, for screenshots. */
  rasteriser(): Promise<{ domToCanvas: typeof domToCanvas }>;
}

/** Dynamic `import()`s, which a bundler splits into chunks of their own. */
export const defaultCaptureLoader: CaptureLoader = {
  recorder: () => import("rrweb"),
  rasteriser: () => import("modern-screenshot"),
};

/** Start fetching the capture libraries ahead of a capture - a UI calls this
 *  when it opens, so the first screenshot or recording isn't waiting on the
 *  network. Failures are left for the capture itself to report. An instance's
 *  own `preloadCapture()` uses the loader it was created with. */
export function preloadCapture(loader: CaptureLoader = defaultCaptureLoader): void {
  loader.recorder().catch(() => {});
  loader.rasteriser().catch(() => {});
}
