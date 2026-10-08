import { createRoot } from "react-dom/client";
import { createBrainbox, type BrainboxOptions, type Identity } from "@brainbox/core";
import { BrainboxProvider } from "@brainbox/react";
import type { TriggerMode } from "@brainbox/shared";
import type { Position } from "./lib/position.ts";
import { widgetStore } from "./lib/widget-store.ts";
import { BrainboxWidget } from "./widget.tsx";

export interface MountOptions extends BrainboxOptions {
  trigger?: TriggerMode;
  position?: Position;
}

/** The mounted widget, for a host with no React tree of its own. */
export interface WidgetHandle {
  open(): void;
  close(): void;
  identify(identity: Identity): void;
  /** Unmount the UI, remove it from the page and destroy the instance. */
  destroy(): void;
}

/** Put the widget on the page. This is what the script-tag bundle calls; a
 *  React host should render `<BrainboxWidget />` instead. */
export function mount({ trigger, position, ...options }: MountOptions): WidgetHandle {
  const brainbox = createBrainbox(options);
  const store = widgetStore(brainbox);

  // The React root itself renders nothing visible: the widget portals into
  // the shadow host it creates. This element only anchors the tree.
  const anchor = document.createElement("div");
  anchor.setAttribute("data-brainbox-root", "");
  document.body.appendChild(anchor);
  const root = createRoot(anchor);
  root.render(
    <BrainboxProvider brainbox={brainbox}>
      <BrainboxWidget trigger={trigger} position={position} />
    </BrainboxProvider>,
  );

  return {
    open: store.open,
    close: store.close,
    identify: brainbox.identify,
    destroy() {
      root.unmount();
      anchor.remove();
      brainbox.destroy();
    },
  };
}
