import type { record } from "rrweb";
import type { domToCanvas } from "modern-screenshot";
import type { CaptureLoader } from "@ganeshdole/brainbox-core";

// The script-tag build's `CaptureLoader`, handed to core by embed.ts. A
// bundler would split rrweb and modern-screenshot into chunks; an IIFE can't,
// so they ship as a sibling `widget-capture.js` that this injects on first use.
//
// A classic <script>, not `import()`: a module fetch from a customer's page is
// cross-origin and would need CORS headers on our static files. A script tag
// needs nothing the page doesn't already allow for `widget.js`.

export interface CaptureLibs {
  record: typeof record;
  domToCanvas: typeof domToCanvas;
}

/** Where `widget-capture.js` publishes itself. */
export const CAPTURE_GLOBAL = "__brainboxCapture";

/** Resolve the sibling file against the tag that loaded us. */
export function captureUrl(scriptSrc: string): string {
  return new URL("widget-capture.js", scriptSrc).href;
}

// Read at eval time - for a classic <script src> this is our own tag. The
// fallback is the same one embed.ts uses for the tag it reads config from.
const ownSrc =
  (document.currentScript as HTMLScriptElement | null)?.src ??
  document.querySelector<HTMLScriptElement>("script[data-project][data-endpoint]")?.src ??
  "";

let loading: Promise<CaptureLibs> | null = null;

/** Inject `widget-capture.js` once and resolve with what it publishes. A failed
 *  load is forgotten so the next capture tries again. */
export function loadCapture(src = ownSrc): Promise<CaptureLibs> {
  loading ??= new Promise<CaptureLibs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = captureUrl(src);
    script.async = true;
    script.onload = () => {
      const libs = (window as unknown as Record<string, CaptureLibs | undefined>)[CAPTURE_GLOBAL];
      if (libs) resolve(libs);
      else reject(new Error("widget-capture.js loaded but published nothing"));
    };
    script.onerror = () => reject(new Error("Couldn't load widget-capture.js"));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Both libraries come from the one sibling script. */
export const siblingScriptLoader: CaptureLoader = {
  recorder: () => loadCapture(),
  rasteriser: () => loadCapture(),
};
