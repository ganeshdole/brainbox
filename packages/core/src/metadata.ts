import type { CapturedMetadata, Identity } from "@brainbox/shared";

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
    emit(args.map(stringify).join(" "));
    original.apply(console, args);
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

/** Start collecting console errors into a new buffer. */
export function captureErrors(max = MAX_ERRORS): ErrorLog {
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

/** Snapshot of the host page at submit time. */
export function captureMetadata({
  consoleErrors,
  identity,
  selector,
}: {
  consoleErrors: string[];
  identity?: Identity;
  selector?: string;
}): CapturedMetadata {
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
  };
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
