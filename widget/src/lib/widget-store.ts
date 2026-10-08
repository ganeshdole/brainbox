import type { Brainbox } from "@brainbox/core";

/** Whether the widget UI is open, shared between `<BrainboxWidget />` and
 *  whoever wants to open it: a host button, `window.Brainbox.open()`. Core
 *  has no idea of "open"; that is a UI matter, so it lives here. */
export interface WidgetStore {
  isOpen(): boolean;
  subscribe(listener: () => void): () => void;
  open(): void;
  close(): void;
}

export function createWidgetStore(): WidgetStore {
  let open = false;
  const listeners = new Set<() => void>();
  const set = (next: boolean) => {
    if (next === open) return;
    open = next;
    for (const listener of listeners) listener();
  };
  return {
    isOpen: () => open,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: () => set(true),
    close: () => set(false),
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
  close: () => {},
};
