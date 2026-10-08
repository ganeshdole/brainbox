import { shadowCss } from "./shadow-css.ts";

/** The widget's foothold in the host page: one element for `<body>` with a
 *  shadow root, and inside it the container the React tree renders into. */
export interface ShadowHost {
  /** The element for the host document. Hidden while screenshotting. */
  element: HTMLElement;
  /** Where to render. Carries the `.dark` class the stylesheet keys off. */
  container: HTMLElement;
}

/** Build the shadow host with the widget stylesheet injected (ADR 0001: host
 *  CSS cannot reach in, ours cannot leak out). Detached: the caller appends
 *  `element` to `<body>` when it is ready to show it. */
export function createShadowHost(css: string): ShadowHost {
  const element = document.createElement("div");
  element.id = "brainbox-widget";
  // keep the widget's own UI out of rrweb session recordings (core's blockClass)
  element.classList.add("rr-block");
  element.style.position = "relative";
  element.style.zIndex = "2147483647";

  const shadow = element.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = shadowCss(css);
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.className = "dark";
  shadow.appendChild(container);

  return { element, container };
}
