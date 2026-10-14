// @ganeshdole/brainbox-widget/markup - the markup step on its own: draw boxes,
// arrows, freehand and notes over a frozen page or any image, and get the
// marks back as core `Mark`s.
//
// <DraftMarkup draft={draft} /> runs it over a core `Draft`; <MarkupOverlay />
// over a plain image. Wrap either in <BrainboxShadow> for the widget's styles.
// Pieces for a surface of your own: the toolbar, a mark as SVG, the text-note
// input and the drag-to-draw hook.

export { DraftMarkup, type DraftMarkupProps } from "./components/DraftMarkup.tsx";
export { MarkupOverlay, type MarkupOverlayProps } from "./components/MarkupOverlay.tsx";
export { MarkupToolbar, type MarkupToolbarProps } from "./components/MarkupToolbar.tsx";
export {
  MarkShape,
  MarkTextInput,
  type MarkShapeProps,
  type MarkTextInputProps,
} from "./components/MarkShape.tsx";
export {
  isDragTool,
  nextMarkId,
  useDrawing,
  type Drawing,
  type DrawingOptions,
  type DragTool,
} from "./lib/use-drawing.ts";
export { BrainboxShadow, type BrainboxShadowProps } from "./components/BrainboxShadow.tsx";
export { createShadowHost, type ShadowHost } from "./lib/shadow-host.ts";
export { widgetCss } from "./lib/stylesheet.ts";
