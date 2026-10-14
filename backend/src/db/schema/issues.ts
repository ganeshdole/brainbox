import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type {
  CapturedMetadata,
  Importance,
  IssueCloseReason,
  IssueEvent,
  IssueKind,
  IssuePriority,
  IssueStatus,
  Region,
  TranscriptStatus,
} from "@ganeshdole/brainbox-shared";

import { users } from "./auth-schema.ts";
import { features } from "./features.ts";
import { projects } from "./projects.ts";

// jsonb columns are typed straight from the @ganeshdole/brainbox-shared contract - this is
// the first cross-package consumer of the shared types.
//
// DB ↔ shared `Issue` seam (handled at the API boundary in step 5, not here):
//   - `createdAt` is a JS Date → `.toISOString()` for the API response.
//   - flat `screenshotKey`/`audioKey`/`audioMime` compose into the shared
//     `Issue.screenshot` / `Issue.audio` objects (+ presigned `url` once R2 lands).
//   - `region` / `metadata` jsonb pass through 1:1.
export const issues = pgTable(
  "issues",
  {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  // Triage. New reports arrive as "new"; the migration that added these set
  // older issues to "open", so nobody opens an inbox of every report ever sent.
  status: text("status").$type<IssueStatus>().notNull().default("new"),
  priority: text("priority").$type<IssuePriority>().notNull().default("none"),
  closeReason: text("close_reason").$type<IssueCloseReason>(),
  statusChangedAt: timestamp("status_changed_at", { mode: "date", withTimezone: true }),
  // A bug report or a feature request; rows from before feature requests are bugs.
  kind: text("kind").$type<IssueKind>().notNull().default("bug"),
  // How much a feature request matters to whoever asked; null on bugs.
  importance: text("importance").$type<Importance>(),
  // The Feature a feature request is attached to; null while it waits to be
  // sorted. Deleting the Feature sends its requests back to waiting.
  featureId: text("feature_id").references(() => features.id, { onDelete: "set null" }),
  text: text("text"),
  // A submission is a screenshot OR a screen recording - so screenshot_key,
  // crop_key and region are all nullable (a recording has a last-frame
  // screenshot, and a region only if marks were in view when it stopped).
  screenshotKey: text("screenshot_key"),
  // Auto-generated crop of the highlighted region (null if cropping failed).
  cropKey: text("crop_key"),
  // Screen recording (webm video with mic audio).
  videoKey: text("video_key"),
  videoMime: text("video_mime"),
  // Speech-to-text of the recording's mic audio; null when there's no video
  // or transcription was disabled at ingest time.
  videoTranscript: text("video_transcript"),
  videoTranscriptStatus: text("video_transcript_status").$type<TranscriptStatus>(),
  // Session replay: gzipped rrweb event log (prompt-free DOM recording).
  sessionKey: text("session_key"),
  audioKey: text("audio_key"),
  audioMime: text("audio_mime"),
  // Speech-to-text of the voice note. Status is null when the issue has no
  // audio or transcription was disabled at ingest time.
  audioTranscript: text("audio_transcript"),
  audioTranscriptStatus: text("audio_transcript_status").$type<TranscriptStatus>(),
  region: jsonb("region").$type<Region>(),
  metadata: jsonb("metadata").$type<CapturedMetadata>().notNull(),
  },
  (t) => [index("issues_feature_id_idx").on(t.featureId)],
);

// Append-only log of triage changes, written in the same transaction as the
// change itself. A deleted Account leaves its events with `actor_id` null.
export const issueEvents = pgTable(
  "issue_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<IssueEvent["kind"]>().notNull(),
    from: text("from"),
    to: text("to"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("issue_events_issue_idx").on(t.issueId, t.createdAt)],
);
