import { useSyncExternalStore } from "react";
import { useBrainbox } from "@brainbox/react";
import { NO_WIDGET, widgetStore } from "./lib/widget-store.ts";

/** Open or close the widget from anywhere under the same provider. */
export function useBrainboxWidget(): { isOpen: boolean; open(): void; close(): void } {
  const brainbox = useBrainbox();
  const store = brainbox ? widgetStore(brainbox) : NO_WIDGET;
  const isOpen = useSyncExternalStore(store.subscribe, store.isOpen, store.isOpen);
  return { isOpen, open: store.open, close: store.close };
}
