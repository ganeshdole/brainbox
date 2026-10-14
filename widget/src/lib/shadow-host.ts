/** The widget's foothold in the host page: one element for `<body>` with a
 *  shadow root, and inside it the container the React tree renders into. */
export interface ShadowHost {
  /** The element for the host document. Hidden while screenshotting. */
  element: HTMLElement;
  /** Where to render. Carries `.bb-root`, plus the `.dark` class the
   *  stylesheet keys colours off when the theme is dark (lib/theme.ts). It is
   *  the shadow part `root`, so the host page can set the design tokens on it:
   *  `[data-brainbox-host]::part(root) { --bg-brand: #6d28d9 }`. */
  container: HTMLElement;
}

/** The `id` of the widget's element on the host page. Exported so a host can
 *  exempt it (see `isBrainboxEvent`) without hard-coding the string. Only
 *  the widget's own host has it; a page can hold one widget but any number
 *  of `<BrainboxShadow>`s, and ids must be unique. */
export const BRAINBOX_HOST_ID = "brainbox-widget";

/** On every Brainbox shadow host, the widget's and each standalone one: what
 *  `isBrainboxEvent` and page theming (`[data-brainbox-host]::part(root)`)
 *  match. */
const HOST_ATTRIBUTE = "data-brainbox-host";

/**
 * Whether an event came from inside the widget, or any other Brainbox shadow
 * root (`<BrainboxShadow>`). Its UI lives in a shadow root,
 * so outside it `event.target` is our host element, never the textarea or
 * button underneath: to a focus trap on `document` the widget looks like page
 * background. A trap that cancels keys aimed outside its modal can call this
 * first and let the widget's events through.
 */
export function isBrainboxEvent(event: Event): boolean {
  const path = event.composedPath();
  const nodes = path.length > 0 ? path : [event.target];
  return nodes.some((n) => n instanceof Element && n.hasAttribute(HOST_ATTRIBUTE));
}

/** Pointer events a host commonly treats as "clicked outside". */
export const ISOLATED_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "touchstart",
  "touchend",
] as const;

function stopAtHost(event: Event): void {
  event.stopPropagation();
}

/** Build the shadow host (ADR 0001: host CSS cannot reach in, ours cannot leak
 *  out). The stylesheet arrives with the UI chunk (`widget-ui.tsx`), which renders it
 *  into `container`. Detached: the caller appends `element` to `<body>` when
 *  it is ready to show it. `id` is for the widget's own host
 *  (`BRAINBOX_HOST_ID`); others go without one. */
export function createShadowHost({ id }: { id?: string } = {}): ShadowHost {
  const element = document.createElement("div");
  if (id) element.id = id;
  element.setAttribute(HOST_ATTRIBUTE, "");
  // keep the widget's own UI out of rrweb session recordings (core's blockClass)
  element.classList.add("rr-block");
  element.style.position = "relative";
  element.style.zIndex = "2147483647";

  // The host page must not hear the widget's clicks. Pages close their open
  // menus on any click elsewhere, and to them a click on the widget is
  // elsewhere, so picking Screenshot lost the very menu being reported.
  // Listeners inside the shadow root (React's) have already run by the time
  // the event reaches this element; it stops here, before the host's document.
  // Capture-phase listeners still see it. Keys are left alone: the widget's
  // own shortcuts listen on window.
  for (const type of ISOLATED_EVENTS) element.addEventListener(type, stopAtHost);

  const shadow = element.attachShadow({ mode: "open" });

  const container = document.createElement("div");
  container.className = "bb-root dark";
  // Page styles on `::part(root)` beat the tokens the stylesheet declares on
  // `.dark`, in either theme: across shadow boundaries the outer rule wins.
  container.setAttribute("part", "root");
  shadow.appendChild(container);

  return { element, container };
}
