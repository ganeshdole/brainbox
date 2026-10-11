/** Keys the browser turns into a page scroll when nothing editable has focus. */
const SCROLL_KEYS = new Set([
  " ",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

/** Whether `key` pressed on `target` would scroll the page. In a text field the
 *  same keys move the caret, and Space on a button presses it (the toolbar's,
 *  for keyboard users), so those are left alone. */
export function isScrollKey(key: string, target: EventTarget | null): boolean {
  if (!SCROLL_KEYS.has(key)) return false;
  if (!(target instanceof HTMLElement)) return true;
  if (key === " " && (target instanceof HTMLButtonElement || target.getAttribute("role") === "button")) {
    return false;
  }
  return !(
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Hold the host page still while the frozen shot is up.
 *
 * A `position: fixed` overlay covers the page but doesn't stop the wheel, a
 * touch drag or the keyboard from scrolling it underneath. That isn't just
 * cosmetic: marks are drawn in viewport coordinates over the shot, and the
 * element under them (the region's selector) is read from the live page - a
 * page that has scrolled since would name the wrong one.
 *
 * Scrolling is blocked at the input rather than with `overflow: hidden` on the
 * root, which would drop the scrollbar and widen the viewport out from under
 * the shot. A snap-back on `scroll` covers what can't be cancelled, like
 * dragging a classic scrollbar. Returns the unlock.
 */
export function lockScroll(win: Window = window): () => void {
  const x = win.scrollX;
  const y = win.scrollY;

  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  const onKey = (e: KeyboardEvent) => {
    // composedPath reaches into the widget's (open) shadow root, where the
    // text tool's input lives
    if (isScrollKey(e.key, e.composedPath()[0] ?? null)) e.preventDefault();
  };
  const onScroll = () => {
    if (win.scrollX !== x || win.scrollY !== y) win.scrollTo(x, y);
  };

  const active = { capture: true, passive: false };
  win.addEventListener("wheel", block, active);
  win.addEventListener("touchmove", block, active);
  win.addEventListener("keydown", onKey, true);
  win.addEventListener("scroll", onScroll);
  return () => {
    win.removeEventListener("wheel", block, active);
    win.removeEventListener("touchmove", block, active);
    win.removeEventListener("keydown", onKey, true);
    win.removeEventListener("scroll", onScroll);
  };
}
