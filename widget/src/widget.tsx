import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import type { TriggerMode, WidgetTheme } from "@ganeshdole/brainbox-shared";
import { useBrainbox } from "@ganeshdole/brainbox-react";
import type { Position } from "./lib/position.ts";
import { useShadowHost } from "./lib/use-shadow-host.ts";
import type { WidgetComponents } from "./slots.ts";
import { useBrainboxWidget } from "./use-brainbox-widget.ts";

// The screens and their stylesheet are most of the widget's weight, and most
// page views never open it. A bundler host gets them as a split chunk; the
// script-tag build inlines it.
const WidgetUi = lazy(() => import("./widget-ui.tsx"));

export interface BrainboxWidgetProps {
  /** `floating` renders our launcher button; `manual` waits for
   *  `useBrainboxWidget().open()` or a host trigger. */
  trigger?: TriggerMode;
  /** Which corner the launcher and panels sit in. */
  position?: Position;
  /** `dark` (default), `light`, or `system` to follow the visitor's OS. */
  theme?: WidgetTheme;
  /** Offer "Suggest a feature" in the chooser (default `true`). A host's own
   *  `start("feature")` opens the form either way. */
  featureRequests?: boolean;
  /** Your own component for any step, e.g. `{ Composer: MyComposer }`; the
   *  rest stay ours. Typed against the props of the screens exported from
   *  `@ganeshdole/brainbox-widget/ui`. */
  components?: WidgetComponents;
}

/**
 * Brainbox's own capture UI, for a React tree that has a `<BrainboxProvider>`
 * above it. Renders into a shadow root appended to `<body>` rather than where
 * it sits in the tree: the host's styles cannot reach it there, and no
 * ancestor's `overflow` or `transform` can trap its fixed-position panels.
 */
export function BrainboxWidget({
  trigger = "floating",
  position = "bottom-right",
  theme = "dark",
  featureRequests = true,
  components,
}: BrainboxWidgetProps) {
  const brainbox = useBrainbox();
  const host = useShadowHost(theme);
  // Our launcher has to show, so `floating` loads the UI straight away;
  // `manual` waits until the host first opens or starts a capture, and keeps
  // it from then on (the UI's own state, e.g. a draft, outlives a close).
  const { isOpen } = useBrainboxWidget();
  const [wanted, setWanted] = useState(false);
  if (!wanted && (trigger === "floating" || isOpen)) setWanted(true);

  if (!brainbox || !host || !wanted) return null;
  return createPortal(
    <Suspense fallback={null}>
      <WidgetUi
        brainbox={brainbox}
        hostEl={host.element}
        trigger={trigger}
        position={position}
        featureRequests={featureRequests}
        components={components}
      />
    </Suspense>,
    host.container,
  );
}
