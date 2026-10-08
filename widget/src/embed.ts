import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { brainboxTransport, createBrainbox, type Identity, type ProjectKey } from "@brainbox/core";
import { App } from "./App.tsx";
import { readConfig } from "./lib/config.ts";
import { shadowCss } from "./lib/shadow-css.ts";
import css from "./index.css?inline";

// Captured at eval time - for a classic <script src> this is the embedding tag.
// Module scripts (dev harness) leave it null, so we fall back to a query below.
const currentScript = document.currentScript as HTMLScriptElement | null;

// Window events for host pages: "brainbox:open" / "brainbox:close" (fired by the
// api below) and "brainbox:submitted" ({ detail: { id } }) after a successful submit.
const api = {
  identify(identity: Identity) {
    brainbox?.identify(identity);
  },
  open() {
    window.dispatchEvent(new CustomEvent("brainbox:open"));
  },
  close() {
    window.dispatchEvent(new CustomEvent("brainbox:close"));
  },
};

declare global {
  interface Window {
    Brainbox: typeof api;
  }
}
window.Brainbox = api;

/** The engine behind this page's widget. Created in `mount()`, so an
 *  `identify()` call that beats DOMContentLoaded is a no-op rather than a crash. */
let brainbox: ReturnType<typeof createBrainbox> | null = null;

function findScript(): HTMLScriptElement | null {
  return (
    currentScript ??
    document.querySelector<HTMLScriptElement>("script[data-project][data-endpoint]")
  );
}

function mount() {
  const config = readConfig(findScript());
  if (!config) {
    console.error("[brainbox] missing data-project or data-endpoint on the script tag");
    return;
  }

  brainbox = createBrainbox({
    transport: brainboxTransport({
      endpoint: config.endpoint,
      projectKey: config.projectKey as ProjectKey,
    }),
    onSubmitted: ({ id }) =>
      window.dispatchEvent(new CustomEvent("brainbox:submitted", { detail: { id } })),
  });

  const host = document.createElement("div");
  host.id = "brainbox-widget";
  // keep the widget's own UI out of rrweb session recordings (session.ts blockClass)
  host.classList.add("rr-block");
  host.style.position = "relative";
  host.style.zIndex = "2147483647";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = shadowCss(css);
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.className = "dark";
  shadow.appendChild(container);

  // "mount" mode: the host renders feedback through their own trigger.
  if (config.mode === "mount" && config.mount) {
    const target = document.querySelector(config.mount);
    target?.addEventListener("click", () => api.open());
  }

  createRoot(container).render(createElement(App, { brainbox, config, hostEl: host }));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
