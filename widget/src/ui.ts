// @ganeshdole/brainbox-widget/ui - the widget's screens, one by one, for a
// host composing its own flow, or overriding one step of ours
// (`<BrainboxWidget components={...} />`).
//
// Each screen is controlled: it holds only what the user is typing or
// drawing, and reports back through its callbacks. None reads the widget's
// store or a Brainbox instance. Wrap them in <BrainboxShadow> for the
// widget's styles. Importing this pulls the screens into your bundle; the
// main entry keeps them in a chunk loaded on first open.

export { Launcher, type LauncherProps } from "./components/Launcher.tsx";
export { Chooser, type ChooserProps } from "./components/Chooser.tsx";
export { RecordOverlay, type RecordOverlayProps } from "./components/RecordOverlay.tsx";
export { Composer, type ComposerProps } from "./components/Composer.tsx";
export { FeatureComposer, type FeatureComposerProps } from "./components/FeatureComposer.tsx";
export { Result, type ResultProps } from "./components/Result.tsx";
export { VoiceNote, type VoiceNoteProps } from "./components/VoiceNote.tsx";
export { BarRow, type BarRowProps } from "./components/BarVisualizer.tsx";
export { useMultibandVolume, type MultibandOptions } from "./lib/use-multiband.ts";
export type { WidgetComponents } from "./slots.ts";
export type { Position } from "./lib/position.ts";
// Last, as it brings the stylesheet: see `manualChunks` in vite.config.ts.
export * from "./markup.ts";
