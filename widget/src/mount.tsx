import { createRoot } from "react-dom/client";
import {
  createBrainbox,
  type BrainboxOptions,
  type Identity,
  type ReportField,
} from "@ganeshdole/brainbox-core";
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import type { TriggerMode, WidgetTheme } from "@ganeshdole/brainbox-shared";
import type { Position } from "./lib/position.ts";
import { widgetStore, type CaptureMode } from "./lib/widget-store.ts";
import { BrainboxWidget } from "./widget.tsx";

export interface MountOptions extends BrainboxOptions {
  trigger?: TriggerMode;
  position?: Position;
  theme?: WidgetTheme;
}

/** The mounted widget, for a host with no React tree of its own. */
export interface WidgetHandle {
  /** Show the chooser. */
  open(): void;
  /** Go straight into a screenshot or a recording, skipping the chooser. */
  start(mode: CaptureMode): void;
  close(): void;
  identify(identity: Identity): void;
  /** Replaces your app's details sent with every report. */
  setFields(fields: ReportField[]): void;
  /** Unmount the UI, remove it from the page and destroy the instance. */
  destroy(): void;
}

/** Put the widget on the page. This is what the script-tag bundle calls; a
 *  React host should render `<BrainboxWidget />` instead. */
export function mount({ trigger, position, theme, ...options }: MountOptions): WidgetHandle {
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
      <BrainboxWidget trigger={trigger} position={position} theme={theme} />
    </BrainboxProvider>,
  );

  return {
    open: store.open,
    start: store.start,
    close: store.close,
    identify: brainbox.identify,
    setFields: brainbox.setFields,
    destroy() {
      root.unmount();
      anchor.remove();
      brainbox.destroy();
    },
  };
}
