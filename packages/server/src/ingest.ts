import type { FeedbackPayload } from "@brainbox/shared";
import type { z } from "zod";
import { feedbackSchema } from "./schema.ts";

/** Upload caps in bytes, one per file part. */
export interface IngestLimits {
  screenshotBytes: number;
  videoBytes: number;
  sessionBytes: number;
  audioBytes: number;
}

/** Screenshot 5MB, video 50MB, session 15MB, audio 10MB. */
export const DEFAULT_INGEST_LIMITS: IngestLimits = {
  screenshotBytes: 5 * 1024 * 1024,
  videoBytes: 50 * 1024 * 1024,
  sessionBytes: 15 * 1024 * 1024,
  audioBytes: 10 * 1024 * 1024,
};

/** The file parts of an upload. A report carries a screenshot, a session
 *  recording or a video (at least one), plus optional audio. */
export interface IngestFiles {
  screenshot?: File;
  video?: File;
  /** A gzipped rrweb event log (application/gzip or application/json). */
  session?: File;
  audio?: File;
}

/** What to send back when an upload is rejected. */
export interface IngestRejection {
  ok: false;
  status: 400 | 413;
  body: { error: string; issues?: z.core.$ZodIssue[] };
}

export type IngestResult =
  | {
      ok: true;
      payload: FeedbackPayload;
      files: IngestFiles;
      /** The whole multipart body, for parts the format does not define, such
       *  as the `context` part a host's own transport adds. The request body
       *  can only be read once, so it is handed back here. */
      form: FormData;
    }
  | IngestRejection;

/**
 * Read a widget upload off a web-standard `Request`: the multipart body, the
 * `json` part validated against `FeedbackPayload`, and each file part's type
 * and size. Says nothing about project keys or origins; that is the host's
 * decision once it knows the payload.
 */
export async function parseIngest(request: Request, limits: IngestLimits): Promise<IngestResult> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject(400, "Expected multipart form data");
  }

  // --- structured json part ---
  const jsonRaw = form.get("json");
  if (typeof jsonRaw !== "string") return reject(400, "Missing json part");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonRaw);
  } catch {
    return reject(400, "Invalid json");
  }
  const result = feedbackSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, status: 400, body: { error: "Invalid payload", issues: result.error.issues } };
  }

  // --- capture: a screenshot, a session recording, or a video ---
  const screenshot = file(form, "screenshot");
  if (screenshot) {
    if (!screenshot.type.startsWith("image/")) return reject(400, "screenshot must be an image");
    if (screenshot.size > limits.screenshotBytes) return reject(413, "screenshot too large");
  }

  const video = file(form, "video");
  if (video) {
    if (!video.type.startsWith("video/")) return reject(400, "video must be a video file");
    if (video.size > limits.videoBytes) return reject(413, "video too large");
  }

  const session = file(form, "session");
  if (session && session.size > limits.sessionBytes) return reject(413, "session too large");

  if (!screenshot && !video && !session) return reject(400, "Missing screenshot, video or session");

  // --- audio (optional) ---
  const audio = file(form, "audio");
  if (audio) {
    if (!audio.type.startsWith("audio/")) return reject(400, "audio must be an audio file");
    if (audio.size > limits.audioBytes) return reject(413, "audio too large");
  }

  return { ok: true, payload: result.data, files: { screenshot, video, session, audio }, form };
}

function file(form: FormData, name: string): File | undefined {
  const value = form.get(name);
  return value instanceof File ? value : undefined;
}

function reject(status: 400 | 413, error: string): IngestRejection {
  return { ok: false, status, body: { error } };
}
