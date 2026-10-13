// What a host can hold back from a report, beyond the defaults. Everything here
// is opt-in: with no `privacy` option a report is captured exactly as before.

/** Elements left out of recordings entirely (a placeholder of the same size). */
export const BLOCK_CLASS = "rr-block";
/** Elements whose text is masked in recordings. */
export const MASK_CLASS = "rr-mask";
/** Elements whose changes recordings ignore. */
export const IGNORE_CLASS = "rr-ignore";

export interface PrivacyOptions {
  /** Mask every piece of text on the page in session recordings, not only
   *  inside `.rr-mask`. Typed input values are always masked. */
  maskAllText?: boolean;
  /** A CSS selector whose matches (and their descendants) have their text
   *  masked in session recordings, on top of `.rr-mask`. */
  maskTextSelector?: string;
  /** Apply the same rules to screenshots: `.rr-block` elements are boxed out,
   *  masked text and form field values are covered. Off by default, because
   *  some hosts block heavy elements from recordings only to keep them small. */
  maskScreenshots?: boolean;
}

/** The text-masking part of rrweb's `record()` options. rrweb has no "mask
 *  all text" switch; it checks a node's ancestors against the selector, so
 *  `*` covers everything. */
export function recordMaskOptions(privacy: PrivacyOptions = {}): { maskTextSelector?: string } {
  if (privacy.maskAllText) return { maskTextSelector: "*" };
  if (privacy.maskTextSelector) return { maskTextSelector: privacy.maskTextSelector };
  return {};
}

/** A box to paint over, in viewport CSS pixels. */
export interface Cover {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inputs that show what was typed or picked. Buttons and toggles show nothing private. */
const VALUE_INPUT = 'input:not([type="button"],[type="submit"],[type="reset"],[type="checkbox"],[type="radio"],[type="hidden"],[type="image"],[type="range"],[type="color"])';
const FIELDS = `${VALUE_INPUT}, textarea, select`;
/** Inputs whose label is their `value` attribute, not a text node: masked
 *  like text, since that is what they show. */
const LABEL_INPUT = 'input[type="button"], input[type="submit"], input[type="reset"]';

/**
 * What a screenshot has to cover to match the recording's rules: blocked
 * elements, form fields, and the text of masked elements (every text node,
 * with `maskAllText`). Read from the live page in viewport coordinates, just
 * before it is rasterised. Empty unless `maskScreenshots` is on.
 *
 * Text is covered line by line rather than by its element's box, the way the
 * recording replaces characters rather than whole elements, so the layout
 * around it stays readable.
 */
export function screenshotCovers(privacy: PrivacyOptions = {}, exclude?: HTMLElement): Cover[] {
  if (!privacy.maskScreenshots) return [];
  const covers: Cover[] = [];
  const outside = (el: Element) => !exclude?.contains(el);
  const add = (r: DOMRect) => {
    if (r.width > 0 && r.height > 0) covers.push({ x: r.left, y: r.top, width: r.width, height: r.height });
  };

  const blocked = Array.from(document.querySelectorAll(`.${BLOCK_CLASS}`)).filter(outside);
  const isBlocked = (el: Element) => blocked.some((b) => b.contains(el));
  for (const el of blocked) add(el.getBoundingClientRect());
  for (const el of Array.from(document.querySelectorAll(FIELDS))) {
    if (outside(el) && !isBlocked(el)) add(el.getBoundingClientRect());
  }

  const masked = [`.${MASK_CLASS}`, privacy.maskTextSelector].filter(Boolean).join(", ");
  const isMasked = (el: Element) => !!privacy.maskAllText || el.closest(masked) !== null;
  for (const el of Array.from(document.querySelectorAll(LABEL_INPUT))) {
    if (outside(el) && !isBlocked(el) && isMasked(el)) add(el.getBoundingClientRect());
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || !outside(parent) || isBlocked(parent)) continue;
    // a textarea's or select's text is already under the field's box
    if (parent.closest("textarea, select")) continue;
    if (!isMasked(parent)) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) add(r);
  }
  return covers;
}

/** Paint `covers` onto a viewport shot taken at `scale`. */
export function paintCovers(ctx: CanvasRenderingContext2D, covers: Cover[], scale: number): void {
  if (covers.length === 0) return;
  ctx.save();
  ctx.fillStyle = "#8b8d98";
  for (const c of covers) ctx.fillRect(c.x * scale, c.y * scale, c.width * scale, c.height * scale);
  ctx.restore();
}
