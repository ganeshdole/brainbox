import type { Importance, IssueKind } from "./feedback.ts";
import type { Delivery } from "./integrations.ts";
import type { CapturedMetadata } from "./metadata.ts";
import type { Region } from "./region.ts";

/** A stored R2 object: its key, plus an optional short-lived presigned URL the
 *  dashboard uses to display it. */
export interface StoredFile {
  key: string;
  url?: string;
}

/** Lifecycle of the voice-note transcription. Absent when transcription is
 *  disabled or the issue has no audio. */
export type TranscriptStatus = "pending" | "done" | "failed";

/** Where an issue is in triage. Every report arrives as `new`; `closed` means
 *  it won't be acted on, with a `closeReason` saying why. */
export type IssueStatus = "new" | "open" | "in_progress" | "resolved" | "closed";

/** Linear's and GitHub Projects' scale, so it maps across without translation. */
export type IssuePriority = "none" | "low" | "medium" | "high" | "urgent";

export type IssueCloseReason = "wont_fix" | "duplicate" | "not_reproducible" | "spam";

/** The triage fields a Customer can change, all optional. A `closeReason`
 *  only goes with `status: "closed"`; leaving `closed` clears it. */
export interface IssueTriagePatch {
  status?: IssueStatus;
  priority?: IssuePriority;
  closeReason?: IssueCloseReason | null;
}

/** One change on an issue's activity log. `actor` is absent for changes the
 *  system made. `from`/`to` are the field's values; null is "none" (a close
 *  reason being set or cleared). */
export interface IssueEvent {
  id: string;
  issueId: string;
  kind: "status" | "priority" | "close_reason";
  from: string | null;
  to: string | null;
  actor?: { id: string; name?: string };
  createdAt: string;
}

/** A feedback submission as stored by the backend and rendered by the dashboard.
 *  `createdAt` is an ISO 8601 string for serialization safety across the wire. */
export interface Issue {
  id: string;
  projectId: string;
  createdAt: string;
  status: IssueStatus;
  priority: IssuePriority;
  /** Only when `status` is `closed`, and only if one was given. */
  closeReason?: IssueCloseReason;
  /** When `status` last changed; absent until it first does. */
  statusChangedAt?: string;
  /** A bug report or a feature request. */
  kind: IssueKind;
  /** How much a feature request matters to whoever asked; never on a bug. */
  importance?: Importance;
  /** The Feature a feature request is attached to. Absent means it is new
   *  and waiting to be sorted into one. Never on a bug. */
  featureId?: string;
  text?: string;
  /** Present for screenshot submissions (absent for screen recordings). */
  screenshot?: StoredFile;
  /** Auto-generated close-up: the highlighted `region` cropped out of the
   *  screenshot server-side. Absent on recordings, older issues, or if cropping failed. */
  crop?: StoredFile;
  /** Present for screen-recording submissions (a webm video with mic audio). */
  video?: StoredFile & {
    mime: string;
    /** Speech-to-text of the recording's mic audio; present once done. */
    transcript?: string;
    transcriptStatus?: TranscriptStatus;
  };
  /** Present for session-replay submissions: a gzipped rrweb event log,
   *  replayed in the dashboard. No permission prompt, records only the app. */
  session?: StoredFile;
  audio?: StoredFile & {
    mime: string;
    /** Speech-to-text of the voice note; present once transcription is done. */
    transcript?: string;
    transcriptStatus?: TranscriptStatus;
  };
  /** The highlighted area - only for screenshot submissions. */
  region?: Region;
  metadata: CapturedMetadata;
  /** Where this issue was sent (GitHub, ...). Only on the single-issue endpoint. */
  deliveries?: Delivery[];
}
