import {
  brainboxTransport,
  type Identity,
  type ProjectKey,
  type ReportField,
} from "@ganeshdole/brainbox-core";
import { readConfig, triggerAction } from "./lib/config.ts";
import { siblingScriptLoader } from "./lib/load-capture.ts";
import { isBrainboxEvent } from "./lib/shadow-host.ts";
import type { StartMode } from "./lib/widget-store.ts";
import { mount, type WidgetHandle } from "./mount.tsx";

// The script-tag bundle (`widget.js`). The one file in this package that runs
// on load: it reads the <script> tag, mounts the widget, and publishes the
// `window.Brainbox` API that pasted snippets rely on.

// Captured at eval time - for a classic <script src> this is the embedding tag.
// Module scripts (dev harness) leave it null, so we fall back to a query below.
const currentScript = document.currentScript as HTMLScriptElement | null;

/** Set once the DOM is ready. Calls that beat it are no-ops, not crashes,
 *  except who is reporting and the app's fields: a snippet sets those right
 *  away, so they are kept and applied when the widget mounts. */
let widget: WidgetHandle | null = null;
let earlyIdentity: Identity | undefined;
let earlyFields: ReportField[] | undefined;

// Public API for host pages. "brainbox:submitted" ({ detail: { id } }) fires
// on window after a successful submit.
const api = {
  identify(identity: Identity) {
    if (widget) widget.identify(identity);
    else earlyIdentity = identity;
  },
  /** Your app's own details for every report, e.g.
   *  `[{ label: "Plan", value: "Pro" }]`. Replaces the previous ones. */
  setFields(fields: ReportField[]) {
    if (widget) widget.setFields(fields);
    else earlyFields = fields;
  },
  open() {
    widget?.open();
  },
  /** "screenshot", "record" or "feature": skips the chooser. */
  start(mode: StartMode) {
    widget?.start(mode);
  },
  close() {
    widget?.close();
  },
  /** True for an event from inside the widget, for a host's focus trap to let
   *  through: outside its shadow root the target is only the host element. */
  isBrainboxEvent,
};

declare global {
  interface Window {
    Brainbox: typeof api;
  }
}
// Turbo Drive, Livewire's wire:navigate and htmx run the scripts in each new
// <body> they swap in, so a tag before </body> runs again on every navigation.
// The first run owns the page; the widget it mounted is kept on the new body
// (lib/keep-on-page.ts), so a second would be a duplicate.
const LOADED = Symbol.for("brainbox.widget.loaded");
const firstRun = !Reflect.has(window, LOADED);
if (firstRun) {
  Reflect.set(window, LOADED, true);
  window.Brainbox = api;
}

function findScript(): HTMLScriptElement | null {
  return (
    currentScript ??
    document.querySelector<HTMLScriptElement>("script[data-project][data-endpoint]")
  );
}

function boot() {
  const config = readConfig(findScript());
  if (!config) {
    console.error("[brainbox] missing data-project or data-endpoint on the script tag");
    return;
  }

  widget = mount({
    transport: brainboxTransport({
      endpoint: config.endpoint,
      projectKey: config.projectKey as ProjectKey,
    }),
    trigger: config.trigger,
    position: config.position,
    theme: config.theme,
    featureRequests: config.featureRequests,
    // The built widget.js fetches rrweb and modern-screenshot as the sibling
    // widget-capture.js. The dev server has no such file; core's default
    // `import()`s work there instead.
    loader: import.meta.env.DEV ? undefined : siblingScriptLoader,
    identity: earlyIdentity,
    fields: earlyFields,
    onSubmitted: ({ id }) =>
      window.dispatchEvent(new CustomEvent("brainbox:submitted", { detail: { id } })),
  });

  // "mount" mode: the host opens feedback from its own element.
  if (config.trigger === "manual" && config.mount) {
    document.querySelector(config.mount)?.addEventListener("click", () => api.open());
  }

  // Any element marked data-brainbox is a trigger, e.g.
  // <button data-brainbox="feature">Request a feature</button>. Delegated, so
  // elements a single-page app renders later work too.
  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("[data-brainbox]") : null;
    if (!(el instanceof HTMLElement)) return;
    const action = triggerAction(el.dataset.brainbox);
    if (action === "open") api.open();
    else if (action) api.start(action);
  });
}

if (firstRun) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
