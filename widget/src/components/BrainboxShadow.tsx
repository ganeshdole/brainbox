import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WidgetTheme } from "@ganeshdole/brainbox-shared";
import type { ShadowHost } from "../lib/shadow-host.ts";
import { widgetCss } from "../lib/stylesheet.ts";
import { useShadowHost } from "../lib/use-shadow-host.ts";

export interface BrainboxShadowProps {
  children: ReactNode;
  /** `dark` (default), `light`, or `system` to follow the visitor's OS. */
  theme?: WidgetTheme;
  /** A host from `createShadowHost()`, for when something needs its element
   *  before this renders: a draft has to be created with
   *  `{ exclude: host.element }` to keep the overlay out of its screenshot.
   *  Left out, one is built for you. */
  host?: ShadowHost;
}

/**
 * Renders its children where the widget renders its own screens: in a shadow
 * root on `<body>`, with the widget's stylesheet and theme, the host page's
 * CSS kept out and its outside-click listeners kept off. Wrap any screen from
 * `@ganeshdole/brainbox-widget/ui` or `/markup` in one to get it styled.
 */
export function BrainboxShadow({ children, theme = "dark", host }: BrainboxShadowProps) {
  const shadow = useShadowHost(theme, host);
  if (!shadow) return null;
  return createPortal(
    <>
      <style>{widgetCss}</style>
      {children}
    </>,
    shadow.container,
  );
}
