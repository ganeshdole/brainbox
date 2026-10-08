import { brainboxTransport, type Identity, type ProjectKey } from "@brainbox/core";
import { readConfig } from "./lib/config.ts";
import { mount, type WidgetHandle } from "./mount.tsx";

// The script-tag bundle (`widget.js`). The one file in this package that runs
// on load: it reads the <script> tag, mounts the widget, and publishes the
// `window.Brainbox` API that pasted snippets rely on.

// Captured at eval time - for a classic <script src> this is the embedding tag.
// Module scripts (dev harness) leave it null, so we fall back to a query below.
const currentScript = document.currentScript as HTMLScriptElement | null;

/** Set once the DOM is ready. Calls that beat it are no-ops, not crashes. */
let widget: WidgetHandle | null = null;

// Public API for host pages. "brainbox:submitted" ({ detail: { id } }) fires
// on window after a successful submit.
const api = {
  identify(identity: Identity) {
    widget?.identify(identity);
  },
  open() {
    widget?.open();
  },
  close() {
    widget?.close();
  },
};

declare global {
  interface Window {
    Brainbox: typeof api;
  }
}
window.Brainbox = api;

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
    onSubmitted: ({ id }) =>
      window.dispatchEvent(new CustomEvent("brainbox:submitted", { detail: { id } })),
  });

  // "mount" mode: the host opens feedback from its own element.
  if (config.trigger === "manual" && config.mount) {
    document.querySelector(config.mount)?.addEventListener("click", () => api.open());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
