/** Fallback for `--ease-out` in index.css, where the site's curve lives. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"

/**
 * Settles a disclosure's content in as it opens: a 200ms fade with a 4px
 * drop, or the fade alone under reduced motion. Closing stays instant.
 *
 * Call it from the <summary>'s click, which runs just before the <details>
 * opens, so the first frame that shows the content is already the animation's.
 * (The `toggle` event comes a frame late and flashes the content in full
 * first; a CSS animation on `details[open] > *` plays on the first open only,
 * as Chrome skips style updates inside a closed <details>.)
 */
export function revealOnOpen(summary: HTMLElement): void {
  const details = summary.parentElement
  if (!(details instanceof HTMLDetailsElement) || details.open) return
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || EASE_OUT
  const keyframes: Keyframe[] = reduce
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: "translateY(-4px)" },
        { opacity: 1, transform: "none" },
      ]
  for (const content of details.querySelectorAll<HTMLElement>(":scope > :not(summary)")) {
    // Engines without the Web Animations API just open, without motion.
    if (!("animate" in content)) continue
    content.animate(keyframes, { duration: 200, easing })
  }
}
