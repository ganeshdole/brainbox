// @brainbox/widget - Brainbox's own capture UI, as a library.
//
// In a React tree: <BrainboxProvider> from @brainbox/react, then
// <BrainboxWidget /> and useBrainboxWidget(). Without React: mount().
// The script-tag bundle (embed.ts) is a thin shell over mount().

export { BrainboxWidget, type BrainboxWidgetProps } from "./widget.tsx";
export { useBrainboxWidget } from "./use-brainbox-widget.ts";
export { mount, type MountOptions, type WidgetHandle } from "./mount.tsx";
export type { Position } from "./lib/position.ts";
export type { TriggerMode } from "@brainbox/shared";
