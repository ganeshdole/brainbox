// Some host apps navigate by swapping <body> rather than reloading: Turbo
// Drive (Rails), Livewire's wire:navigate, htmx's hx-boost and Astro's
// <ClientRouter /> replace the body element or its children with the next
// page's. The widget's elements live on <body> (it appends them there, ADR
// 0001), so the first click in such an app took the widget off the page.
//
// Elements registered here are put back on the current <body> whenever they
// are lost that way. They are moved, not rebuilt, so the React tree, the shadow
// root and anything open in it carry on as they were.

const kept = new WeakSet<Element>();
let watching = false;

/** Lost: one of ours, and no longer anywhere on the page. One the host moved
 *  somewhere else on purpose is still connected and stays where it was put. */
function lost(node: Node): node is Element {
  return node instanceof Element && kept.has(node) && !node.isConnected;
}

function restore(nodes: Iterable<Node>): void {
  const ours = Array.from(nodes).filter(lost);
  if (ours.length > 0) document.body.append(...ours);
}

function watch(): void {
  if (watching || typeof MutationObserver === "undefined") return;
  watching = true;

  let body = document.body;
  // The body's children went (htmx's innerHTML swap, a morph).
  const children = new MutationObserver((records) => {
    restore(records.flatMap((r) => Array.from(r.removedNodes)));
  });
  children.observe(body, { childList: true });

  // The body itself went (Turbo Drive, Livewire, Astro): ours are still
  // children of the old one.
  new MutationObserver(() => {
    const next = document.body;
    if (!next || next === body) return;
    const old = body;
    body = next;
    children.disconnect();
    children.observe(body, { childList: true });
    restore(old.children);
  }).observe(document.documentElement, { childList: true });
}

/**
 * Keep `element` on `<body>` until the returned function is called. Call that
 * before removing the element on purpose, or it comes straight back.
 *
 * Also marks it `data-turbo-temporary`, so Turbo leaves it out of the page
 * snapshots it caches: a cached copy would come back as an empty element with
 * the widget's id.
 */
export function keepOnPage(element: Element): () => void {
  kept.add(element);
  element.setAttribute("data-turbo-temporary", "");
  watch();
  return () => {
    kept.delete(element);
  };
}
