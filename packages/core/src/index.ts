// @ganeshdole/brainbox-core - the capture engine, with no UI and no React.
//
// Importing this module does nothing: only a call has effects, and rrweb and
// modern-screenshot load on the first capture, not with this file.
//
// `createBrainbox()` is the assembled pipeline; `destroy()` undoes everything
// it sets up. The building blocks below it are exported too, for a host that
// assembles its own.

export { createBrainbox, type Brainbox, type BrainboxOptions } from "./brainbox.ts";
export type { BeforeSend, Draft, DraftOptions, DraftState, Recording, SubmitInput } from "./draft.ts";
export type { PrivacyOptions } from "./privacy.ts";
export { brainboxTransport, type Report, type SubmitResult, type Transport } from "./transport.ts";
export { createAnnotations, type Annotations } from "./annotate.ts";
export {
  canSessionRecord,
  startSessionRecording,
  type RecordingOptions,
  type RrwebRecordOptions,
  type SessionCapture,
  type SessionRecording,
  type SessionRecordingOptions,
} from "./session.ts";
export {
  bakeMarks,
  captureViewport,
  type BakeOptions,
  type CaptureViewportOptions,
  type ScreenshotOptions,
} from "./capture.ts";
export { captureErrors, captureMetadata, type ErrorLog, type MetadataInput } from "./metadata.ts";
export { cssPath, elementAt } from "./selector.ts";
export { defaultCaptureLoader, preloadCapture, type CaptureLoader } from "./loader.ts";
export { startAudioRecording, type AudioRecorder } from "./audio.ts";
export * from "./marks.ts";
export type {
  CapturedMetadata,
  Identity,
  Importance,
  IssueKind,
  ProjectKey,
  Region,
  ReportField,
  ReportFieldType,
} from "@ganeshdole/brainbox-shared";
