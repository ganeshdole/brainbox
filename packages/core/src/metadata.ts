import type { CapturedMetadata, Identity, ReportField } from "@ganeshdole/brainbox-shared";

const MAX_ERRORS = 20;

/** A rolling buffer of the host page's recent console errors and uncaught
 *  exceptions, owned by one `createBrainbox()` instance. */
export interface ErrorLog {
  /** The buffer as it stands, oldest first. */
  snapshot(): string[];
  /** Stop collecting. Removes the shared hooks once no log is left listening. */
  stop(): void;
}

// `console.error` is one global, so it is patched once and fans out to every
// live log rather than being wrapped again per instance. The hooks exist only
// while at least one log is listening; the last `stop()` restores the original.
const listeners = new Set<(msg: string) => void>();
let removeHooks: (() => void) | null = null;

function emit(msg: string): void {
  for (const push of listeners) push(msg);
}

function installHooks(): void {
  if (removeHooks) return;
  const original = console.error;
  const patched = (...args: unknown[]) => {
    // The host's log line comes first; capturing it must never be able to stop it.
    original.apply(console, args);
    try {
      emit(args.map(stringify).join(" "));
    } catch {
      // A value we couldn't read is a missed buffer entry, not the host's problem.
    }
  };
  const onError = (e: ErrorEvent) => emit(e.message);
  const onRejection = (e: PromiseRejectionEvent) =>
    emit(`Unhandled rejection: ${stringify(e.reason)}`);

  console.error = patched;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  removeHooks = () => {
    // Someone else may have wrapped console.error after us; only unwind our own.
    if (console.error === patched) console.error = original;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    removeHooks = null;
  };
}

/** Start collecting console errors and uncaught exceptions into a new buffer
 *  of the last `max` (default 20). `console.error` is patched while any log is
 *  listening; call `stop()` when done. */
export function captureErrors({ max = MAX_ERRORS }: { max?: number } = {}): ErrorLog {
  const buffer: string[] = [];
  const push = (msg: string) => {
    buffer.push(msg);
    while (buffer.length > max) buffer.shift();
  };
  listeners.add(push);
  installHooks();
  return {
    snapshot: () => [...buffer],
    stop: () => {
      listeners.delete(push);
      if (listeners.size === 0) removeHooks?.();
    },
  };
}

/** What a report's metadata carries besides the page itself. */
export interface MetadataInput {
  /** Default none; `ErrorLog.snapshot()` is the usual source. */
  consoleErrors?: string[];
  identity?: Identity;
  fields?: ReportField[];
  /** CSS path of the element the report is about (`cssPath()`). */
  selector?: string;
}

/** Snapshot of the host page (URL, title, viewport, browser) plus `input`, as
 *  a report's `metadata`. */
export function captureMetadata({
  consoleErrors = [],
  identity,
  fields,
  selector,
}: MetadataInput = {}): CapturedMetadata {
  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    selector,
    consoleErrors,
    identity,
    // An empty list says nothing; leave it out like an unset one.
    ...(fields?.length && { fields }),
  };
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    // `JSON.stringify` returns undefined for undefined, functions and symbols.
    return JSON.stringify(v) ?? String(v);
  } catch {
    // Circular, or a BigInt inside; `String` can throw too, on an object with
    // no prototype (no `toString`), so the last resort is the tag.
    try {
      return String(v);
    } catch {
      return Object.prototype.toString.call(v);
    }
  }
}
