import type { Brainbox } from "@ganeshdole/brainbox-core";

/** What a report starts as: a marked-up screenshot, or a recording. */
export type CaptureMode = "screenshot" | "record";

/** Whether the widget UI is open, shared between `<BrainboxWidget />` and
 *  whoever wants to open it: a host button, `window.Brainbox.open()`. Core
 *  has no idea of "open"; that is a UI matter, so it lives here. */
export interface WidgetStore {
  isOpen(): boolean;
  subscribe(listener: () => void): () => void;
  /** Open on the chooser, where the user picks screenshot or recording. */
  open(): void;
  /** Open straight into a screenshot or a recording, skipping the chooser.
   *  For a host that offers the two choices in its own UI. */
  start(mode: CaptureMode): void;
  /** The mode `start()` asked for, cleared as it is read. The widget reads it
   *  when it opens; null means show the chooser. */
  takeStart(): CaptureMode | null;
  close(): void;
}

export function createWidgetStore(): WidgetStore {
  let open = false;
  let requested: CaptureMode | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const set = (next: boolean) => {
    if (next === open) return;
    open = next;
    notify();
  };
  return {
    isOpen: () => open,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: () => set(true),
    start(mode) {
      requested = mode;
      // Already open (on the chooser): tell the widget anyway, so it moves on.
      if (open) notify();
      else set(true);
    },
    takeStart() {
      const mode = requested;
      requested = null;
      return mode;
    },
    close: () => {
      requested = null;
      set(false);
    },
  };
}

// One store per instance, so a button deep in the host's tree and the widget
// at its root agree without a second provider. Keyed weakly: the store goes
// away with the instance.
const stores = new WeakMap<Brainbox, WidgetStore>();

/** The store for an instance, created on first use. */
export function widgetStore(brainbox: Brainbox): WidgetStore {
  let store = stores.get(brainbox);
  if (!store) {
    store = createWidgetStore();
    stores.set(brainbox, store);
  }
  return store;
}

/** For a tree with no instance yet: never open, and nothing to do. */
export const NO_WIDGET: WidgetStore = {
  isOpen: () => false,
  subscribe: () => () => {},
  open: () => {},
  start: () => {},
  takeStart: () => null,
  close: () => {},
};
