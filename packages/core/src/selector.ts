/** The host-page element under a point. `exclude` (the UI's own host element)
 *  is hidden for the lookup so the answer is never the widget itself. */
export function elementAt(x: number, y: number, exclude?: HTMLElement): Element | null {
  if (!exclude) return document.elementFromPoint(x, y);
  const prev = exclude.style.visibility;
  exclude.style.visibility = "hidden";
  const el = document.elementFromPoint(x, y);
  exclude.style.visibility = prev;
  return el;
}

/** Best-effort CSS path to an element (id wins; else tag + :nth-of-type, depth ≤ 5). */
export function cssPath(el: Element | null): string | undefined {
  if (!el) return undefined;
  const parts: string[] = [];
  let node: Element | null = el;

  while (node && node.nodeType === 1 && parts.length < 5) {
    const current: Element = node;
    let sel = current.nodeName.toLowerCase();
    if (current.id) {
      const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(current.id) : current.id;
      parts.unshift(`${sel}#${id}`);
      break;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.nodeName === current.nodeName,
      );
      if (siblings.length > 1) {
        sel += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(sel);
    node = parent;
  }

  return parts.join(" > ") || undefined;
}
