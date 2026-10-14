import type { ComponentType } from "react";
import type { ChooserProps } from "./components/Chooser.tsx";
import type { ComposerProps } from "./components/Composer.tsx";
import type { FeatureComposerProps } from "./components/FeatureComposer.tsx";
import type { LauncherProps } from "./components/Launcher.tsx";
import type { MarkupOverlayProps } from "./components/MarkupOverlay.tsx";
import type { RecordOverlayProps } from "./components/RecordOverlay.tsx";
import type { ResultProps } from "./components/Result.tsx";

/**
 * Your own component for any step of the widget's flow, in place of ours. Each
 * gets the same props as the built-in one exported under the same name from
 * `@ganeshdole/brainbox-widget/ui`, and moves the flow on by calling them; the
 * steps you leave out stay ours.
 *
 * They render inside the widget's shadow root, so your page's stylesheets do
 * not reach them: bring their CSS along (a `<style>` inside them, inline
 * styles, the widget's own classes and variables), or portal out to
 * `document.body`. Define them outside your render function, or every render
 * remounts them and loses what the user typed.
 */
export interface WidgetComponents {
  /** The floating button, with `trigger="floating"`. */
  Launcher?: ComponentType<LauncherProps>;
  /** Screenshot, record, or suggest a feature. */
  Chooser?: ComponentType<ChooserProps>;
  /** Drawing on the frozen page. */
  MarkupOverlay?: ComponentType<MarkupOverlayProps>;
  /** The bar shown while a session records. */
  RecordOverlay?: ComponentType<RecordOverlayProps>;
  /** A bug report's words and voice, after the capture. */
  Composer?: ComponentType<ComposerProps>;
  /** The feature-request form. */
  FeatureComposer?: ComponentType<FeatureComposerProps>;
  /** Sending, sent, or failed. */
  Result?: ComponentType<ResultProps>;
}
