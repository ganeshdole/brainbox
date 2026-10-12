import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { CapturedMetadata, Region, TranscriptStatus } from "@brainbox-sh/shared";

import { projects } from "./projects.ts";

// jsonb columns are typed straight from the @brainbox-sh/shared contract - this is
// the first cross-package consumer of the shared types.
//
// DB ↔ shared `Issue` seam (handled at the API boundary in step 5, not here):
//   - `createdAt` is a JS Date → `.toISOString()` for the API response.
//   - flat `screenshotKey`/`audioKey`/`audioMime` compose into the shared
//     `Issue.screenshot` / `Issue.audio` objects (+ presigned `url` once R2 lands).
//   - `region` / `metadata` jsonb pass through 1:1.
export const issues = pgTable("issues", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
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
});
