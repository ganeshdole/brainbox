import { useEffect, useState } from "react";

/**
 * A flag that turns on and switches itself off after `ms` - the "Copied" tick.
 * Turning it on again restarts the clock instead of stacking a second timer
 * (which would switch the new flash off early), and `dispose()` drops the
 * timer so nothing fires after the owner is gone.
 */
export function flashTimer(set: (on: boolean) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() {
      clearTimeout(timer);
      set(true);
      timer = setTimeout(() => {
        timer = undefined;
        set(false);
      }, ms);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** `flashTimer` bound to component state; the timer is cleared on unmount. */
export function useFlash(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const [flash] = useState(() => flashTimer(setOn, ms));
  useEffect(() => () => flash.dispose(), [flash]);
  return [on, flash.trigger];
}
