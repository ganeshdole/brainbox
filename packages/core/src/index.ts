// @brainbox/core - the capture engine, with no UI and no React.
//
// Importing this module does nothing. `createBrainbox()` is the only way in;
// everything it sets up is undone by `destroy()`.

export { createBrainbox, type Brainbox, type BrainboxOptions } from "./brainbox.ts";
export type { Draft, DraftOptions, DraftState, Recording } from "./draft.ts";
export { brainboxTransport, type Report, type SubmitResult, type Transport } from "./transport.ts";
export type { Annotations } from "./annotate.ts";
export { canSessionRecord } from "./session.ts";
export { startAudioRecording, type AudioRecorder } from "./audio.ts";
export * from "./marks.ts";
export type { CapturedMetadata, Identity, ProjectKey, Region } from "@brainbox/shared";
