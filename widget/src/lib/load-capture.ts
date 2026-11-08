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

/** How long `widget-capture.js` gets to arrive. A request that hangs (a proxy
 *  holding it open, a CDN stall) would otherwise leave every capture waiting
 *  on it forever, with no retry. */
export const CAPTURE_LOAD_TIMEOUT_MS = 30_000;

/** Inject `widget-capture.js` once and resolve with what it publishes. A failed
 *  or timed-out load is forgotten, and its tag taken back out of `<head>`, so
 *  the next capture tries again from scratch. */
export function loadCapture(src = ownSrc, timeoutMs = CAPTURE_LOAD_TIMEOUT_MS): Promise<CaptureLibs> {
  loading ??= new Promise<CaptureLibs>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (err: Error) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      reject(err);
    };
    const timer = setTimeout(
      () => fail(new Error("Timed out loading widget-capture.js")),
      timeoutMs,
    );
    script.src = captureUrl(src);
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      const libs = (window as unknown as Record<string, CaptureLibs | undefined>)[CAPTURE_GLOBAL];
      if (libs) resolve(libs);
      else fail(new Error("widget-capture.js loaded but published nothing"));
    };
    script.onerror = () => fail(new Error("Couldn't load widget-capture.js"));
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
