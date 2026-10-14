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
import { widgetStore, type StartMode } from "./lib/widget-store.ts";
import type { WidgetComponents } from "./slots.ts";
import { BrainboxWidget } from "./widget.tsx";

export interface MountOptions extends BrainboxOptions {
  trigger?: TriggerMode;
  position?: Position;
  theme?: WidgetTheme;
  /** Offer "Suggest a feature" in the chooser (default `true`). */
  featureRequests?: boolean;
  /** Your own React components for any step; see `BrainboxWidgetProps`. They
   *  must use the same React as this package. */
  components?: WidgetComponents;
}

/** The mounted widget, for a host with no React tree of its own. */
export interface WidgetHandle {
  /** Show the chooser. */
  open(): void;
  /** Go straight into a screenshot, a recording or a feature request,
   *  skipping the chooser. */
  start(mode: StartMode): void;
  close(): void;
  identify(identity: Identity): void;
  /** Replaces your app's details sent with every report. */
  setFields(fields: ReportField[]): void;
  /** Unmount the UI, remove it from the page and destroy the instance. */
  destroy(): void;
}

/** Put the widget on the page. This is what the script-tag bundle calls; a
 *  React host should render `<BrainboxWidget />` instead. */
export function mount({
  trigger,
  position,
  theme,
  featureRequests,
  components,
  ...options
}: MountOptions): WidgetHandle {
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
      <BrainboxWidget
        trigger={trigger}
        position={position}
        theme={theme}
        featureRequests={featureRequests}
        components={components}
      />
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
