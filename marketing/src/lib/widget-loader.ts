export interface WidgetConfig {
  project: string;
  endpoint: string;
  src: string;
}

export interface WidgetEnv {
  VITE_DEMO_PROJECT_KEY?: string;
  VITE_DEMO_ENDPOINT?: string;
  VITE_DEMO_WIDGET_SRC?: string;
}

// The landing page's own demo inbox. Project keys are public by design -
// they ship in every customer's HTML. Env vars override for local testing
// against a seeded backend (pk_test_local / http://localhost:8787/ingest).
const DEMO_PROJECT_KEY = "pk_oAbjipcitHOfqopWviwemeh9";
const DEMO_ENDPOINT = "https://app.brainbox.ganeshdole.com/ingest";

// The same URL customers paste (dashboard/src/lib/snippet.ts). Loading it
// cross-origin rather than bundling a copy into public/ means the landing page
// dogfoods the real install path and picks up widget releases from the box
// deploy - no marketing rebuild needed. Override to /widget.js to develop
// against a locally built bundle (`pnpm dev` copies one into public/).
const WIDGET_SRC = "https://app.brainbox.ganeshdole.com/widget.js";

declare global {
  interface WindowEventMap {
    "brainbox:submitted": CustomEvent<{ id?: unknown }>;
  }
  interface Window {
    // Optional (unlike the widget's own declaration): the script loads async,
    // so callers must guard with `window.Brainbox?.open()`.
    Brainbox?: { open(): void; close(): void };
  }
}

export function resolveWidgetConfig(env: WidgetEnv): WidgetConfig {
  return {
    project: env.VITE_DEMO_PROJECT_KEY ?? DEMO_PROJECT_KEY,
    endpoint: env.VITE_DEMO_ENDPOINT ?? DEMO_ENDPOINT,
    src: env.VITE_DEMO_WIDGET_SRC ?? WIDGET_SRC,
  };
}

/** Inject the widget script tag once. Safe under StrictMode double-effects. */
export function loadWidget(config: WidgetConfig): void {
  if (document.querySelector("script[data-brainbox-demo]")) return;
  const script = document.createElement("script");
  // Classic script (not type=module) so the widget sees document.currentScript.
  script.src = config.src;
  script.dataset.brainboxDemo = "true";
  script.dataset.project = config.project;
  script.dataset.endpoint = config.endpoint;
  script.dataset.position = "bottom-right";
  document.body.appendChild(script);
}

/**
 * Run `cb` once the widget has installed its API on `window`.
 *
 * The script tag is injected async and off a different origin, so anything that
 * POINTS AT the launcher - the "try it yourself" cue - has to wait for it or it
 * spends the slow-connection case aiming at a button that isn't there. Polls
 * rather than listening: the widget publishes `window.Brainbox` and fires no
 * ready event, and the script's own `load` doesn't guarantee it has mounted.
 *
 * Gives up after `timeoutMs` without calling back - if the widget is blocked or
 * failed to load, the honest thing is to show nothing.
 */
export function onWidgetReady(
  cb: () => void,
  { intervalMs = 150, timeoutMs = 10_000 } = {}
): () => void {
  if (window.Brainbox) {
    cb();
    return () => {};
  }
  let waited = 0;
  const timer = setInterval(() => {
    waited += intervalMs;
    if (window.Brainbox) {
      clearInterval(timer);
      cb();
    } else if (waited >= timeoutMs) {
      clearInterval(timer);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

/** Open the widget the way its launcher would. No-op until the script lands. */
export function openWidget(): void {
  window.Brainbox?.open();
}

/** Listen for successful widget submissions. Returns the cleanup function. */
export function onWidgetSubmitted(cb: (id: string) => void): () => void {
  const handler = (event: CustomEvent<{ id?: unknown }>) => {
    const id = event.detail === null ? undefined : event.detail.id;
    if (typeof id === "string") cb(id);
  };
  window.addEventListener("brainbox:submitted", handler);
  return () => window.removeEventListener("brainbox:submitted", handler);
}
