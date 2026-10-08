import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TriggerMode } from "@brainbox/shared";
import { useBrainbox } from "@brainbox/react";
import { App } from "./App.tsx";
import type { Position } from "./lib/position.ts";
import { createShadowHost, type ShadowHost } from "./lib/shadow-host.ts";
import css from "./index.css?inline";

export interface BrainboxWidgetProps {
  /** `floating` renders our launcher button; `manual` waits for
   *  `useBrainboxWidget().open()` or a host trigger. */
  trigger?: TriggerMode;
  /** Which corner the launcher and panels sit in. */
  position?: Position;
}

/**
 * Brainbox's own capture UI, for a React tree that has a `<BrainboxProvider>`
 * above it. Renders into a shadow root appended to `<body>` rather than where
 * it sits in the tree: the host's styles cannot reach it there, and no
 * ancestor's `overflow` or `transform` can trap its fixed-position panels.
 */
export function BrainboxWidget({ trigger = "floating", position = "bottom-right" }: BrainboxWidgetProps) {
  const brainbox = useBrainbox();
  // Built detached during render (nothing on the page changes yet, and there
  // is no document on the server), attached by the effect below.
  const [host] = useState<ShadowHost | null>(() =>
    typeof document === "undefined" ? null : createShadowHost(css),
  );

  useEffect(() => {
    if (!host) return;
    document.body.appendChild(host.element);
    return () => host.element.remove();
  }, [host]);

  if (!brainbox || !host) return null;
  return createPortal(
    <App brainbox={brainbox} hostEl={host.element} trigger={trigger} position={position} />,
    host.container,
  );
}
