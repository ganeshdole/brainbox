import { useSyncExternalStore } from "react";
import { useBrainbox } from "@ganeshdole/brainbox-react";
import { NO_WIDGET, widgetStore, type StartMode } from "./lib/widget-store.ts";

/** Open or close the widget from anywhere under the same provider. `open()`
 *  shows the chooser; `start(mode)` skips it, for a host that offers
 *  screenshot, recording or "Request a feature" as separate choices in its
 *  own UI. */
export function useBrainboxWidget(): {
  isOpen: boolean;
  open(): void;
  start(mode: StartMode): void;
  close(): void;
} {
  const brainbox = useBrainbox();
  const store = brainbox ? widgetStore(brainbox) : NO_WIDGET;
  const isOpen = useSyncExternalStore(store.subscribe, store.isOpen, store.isOpen);
  return { isOpen, open: store.open, start: store.start, close: store.close };
}
