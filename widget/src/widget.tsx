import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TriggerMode, WidgetTheme } from "@ganeshdole/brainbox-shared";
import { useBrainbox } from "@ganeshdole/brainbox-react";
import type { Position } from "./lib/position.ts";
import { createShadowHost, type ShadowHost } from "./lib/shadow-host.ts";
import { applyTheme } from "./lib/theme.ts";
import { useBrainboxWidget } from "./use-brainbox-widget.ts";

// The screens and their stylesheet are most of the widget's weight, and most
// page views never open it. A bundler host gets them as a split chunk; the
// script-tag build inlines it.
const WidgetUi = lazy(() => import("./ui.tsx"));

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
}: BrainboxWidgetProps) {
  const brainbox = useBrainbox();
  // Built detached during render (nothing on the page changes yet, and there
  // is no document on the server), attached by the effect below.
  const [host] = useState<ShadowHost | null>(() =>
    typeof document === "undefined" ? null : createShadowHost(),
  );
  // Our launcher has to show, so `floating` loads the UI straight away;
  // `manual` waits until the host first opens or starts a capture, and keeps
  // it from then on (the UI's own state, e.g. a draft, outlives a close).
  const { isOpen } = useBrainboxWidget();
  const [wanted, setWanted] = useState(false);
  if (!wanted && (trigger === "floating" || isOpen)) setWanted(true);

  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host.element);
    return () => host.element.remove();
  }, [host]);

  useEffect(() => {
    if (!host) return;
    return applyTheme(host.container, theme);
  }, [host, theme]);

  if (!brainbox || !host || !wanted) return null;
  return createPortal(
    <Suspense fallback={null}>
      <WidgetUi
        brainbox={brainbox}
        hostEl={host.element}
        trigger={trigger}
        position={position}
        featureRequests={featureRequests}
      />
    </Suspense>,
    host.container,
  );
}
