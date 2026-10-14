// @ganeshdole/brainbox-widget - Brainbox's own capture UI, as a library.
//
// In a React tree: <BrainboxProvider> from @ganeshdole/brainbox-react, then
// <BrainboxWidget /> and useBrainboxWidget(). Without React: mount().
// The script-tag bundle (embed.ts) is a thin shell over mount().
// The screens themselves, to compose or override: ./ui and ./markup.

export { BrainboxWidget, type BrainboxWidgetProps } from "./widget.tsx";
export { useBrainboxWidget } from "./use-brainbox-widget.ts";
export { mount, type MountOptions, type WidgetHandle } from "./mount.tsx";
export { BRAINBOX_HOST_ID, isBrainboxEvent } from "./lib/shadow-host.ts";
export type { Position } from "./lib/position.ts";
export type { CaptureMode, StartMode } from "./lib/widget-store.ts";
export type { TriggerMode, WidgetTheme } from "@ganeshdole/brainbox-shared";
// Type-only, so the screens stay out of this entry: the contracts a host's
// `components` are checked against.
export type { WidgetComponents } from "./slots.ts";
export type { LauncherProps } from "./components/Launcher.tsx";
export type { ChooserProps } from "./components/Chooser.tsx";
export type { MarkupOverlayProps } from "./components/MarkupOverlay.tsx";
export type { RecordOverlayProps } from "./components/RecordOverlay.tsx";
export type { ComposerProps } from "./components/Composer.tsx";
export type { FeatureComposerProps } from "./components/FeatureComposer.tsx";
export type { ResultProps } from "./components/Result.tsx";
