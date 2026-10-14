import type { ComponentProps } from "react";
import { App } from "./App.tsx";
import { widgetCss } from "./lib/stylesheet.ts";

// Everything the user sees, as one chunk that `<BrainboxWidget />` loads when
// it is first needed: the panels, the overlays and the inlined stylesheet. A
// host page that never opens the widget never downloads it.

/** The widget's screens with their stylesheet, rendered inside the shadow root. */
export default function WidgetUi(props: ComponentProps<typeof App>) {
  return (
    <>
      <style>{widgetCss}</style>
      <App {...props} />
    </>
  );
}
