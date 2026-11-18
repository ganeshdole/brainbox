export type Position = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** Each viewport edge 1.25rem in, plus the device's safe area on that side, so
 *  on a phone page that draws under the notch or the home indicator
 *  (`viewport-fit=cover`) nothing is parked beneath them. Elsewhere the safe
 *  area is 0. Whole class names, for Tailwind's scanner. */
const EDGE = {
  top: "top-[calc(1.25rem+env(safe-area-inset-top,0px))]",
  bottom: "bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
  left: "left-[calc(1.25rem+env(safe-area-inset-left,0px))]",
  right: "right-[calc(1.25rem+env(safe-area-inset-right,0px))]",
} as const;

const edges = (p: Position) => p.split("-") as ["top" | "bottom", "left" | "right"];

/** Tailwind anchor classes for a fixed element pinned to a viewport corner. */
export function posClass(p: Position): string {
  const [v, h] = edges(p);
  return `${EDGE[v]} ${EDGE[h]}`;
}

/** The corner a panel pinned at `p` grows out of: where the launcher sits. */
export function originClass(p: Position): string {
  switch (p) {
    case "bottom-left":
      return "origin-bottom-left";
    case "top-right":
      return "origin-top-right";
    case "top-left":
      return "origin-top-left";
    default:
      return "origin-bottom-right";
  }
}

/** At most the viewport less both 1.25rem margins and both safe areas. Width
 *  is a percentage of the fixed containing block, which unlike `100vw` leaves
 *  out a classic scrollbar; height is `dvh`, which tracks a phone's URL bar. */
const FIT =
  "max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] " +
  "max-w-[calc(100%-2.5rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))]";

/**
 * The frame every corner panel shares (chooser, composers, result): pinned at
 * `p`, entering out of that corner, and never larger than the screen. A 24rem
 * composer is wider than a 375px phone, and taller than a phone held sideways,
 * so it narrows to the viewport and scrolls inside itself rather than putting
 * its header or Send out of reach.
 */
export function panelClass(p: Position): string {
  return `fixed ${posClass(p)} ${originClass(p)} pop-in z-[2147483647] ${FIT} overflow-y-auto overscroll-contain`;
}
