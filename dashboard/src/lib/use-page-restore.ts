import { useEffect, useEffectEvent } from "react";

/**
 * Calls `reset` when the page comes back from the back/forward cache: the
 * visitor left for Google, GitHub or a checkout, then pressed Back. The page
 * is restored exactly as it was left - mid-click, spinner on, buttons
 * disabled - and no effect re-runs to clear it. A normal load (`persisted`
 * false) needs no reset.
 */
export function onPageRestore(target: EventTarget, reset: () => void): () => void {
  const listener = (e: Event) => {
    if ("persisted" in e && e.persisted === true) reset();
  };
  target.addEventListener("pageshow", listener);
  return () => target.removeEventListener("pageshow", listener);
}

/** `onPageRestore` on the window, for as long as the component is mounted. */
export function usePageRestore(reset: () => void): void {
  const onRestore = useEffectEvent(reset);
  useEffect(() => onPageRestore(window, () => onRestore()), []);
}
