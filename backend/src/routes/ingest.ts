import { Hono } from "hono";
import { cors } from "hono/cors";
import { parseIngest } from "@ganeshdole/brainbox-server";

import { env } from "../env.ts";
import { deliverIssue } from "../integrations/dispatch.ts";
import { cropRegion } from "../lib/crop.ts";
import { transcribeAudio, transcriptionEnabled } from "../lib/transcription.ts";
import { runInBackground } from "../runtime/background.ts";
import { getStorage } from "../storage/index.ts";
import type { Store } from "../store/index.ts";
import type { AppEnv } from "../types.ts";

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
};

const VIDEO_EXT: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
};

export const ingest = new Hono<AppEnv>();

// Public: called cross-origin from arbitrary customer sites, no cookies. The
// per-project origin allowlist is enforced in the handler (not via CORS).
ingest.use("*", cors({ origin: (origin) => origin ?? "*", credentials: false }));

ingest.post("/", async (c) => {
  // The wire format itself (parts, schema, types, sizes) is @ganeshdole/brainbox-server's
  // job; from here on it is ours: which project, where files go, what we store.
  const parsed = await parseIngest(c.req.raw, {
    screenshotBytes: env.MAX_SCREENSHOT_BYTES,
    videoBytes: env.MAX_VIDEO_BYTES,
    sessionBytes: env.MAX_SESSION_BYTES,
    audioBytes: env.MAX_AUDIO_BYTES,
  });
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const feedback = parsed.payload;
  const { screenshot, video, session, audio } = parsed.files;

  // --- project key ---
  const store = c.get("store");
  const project = await store.projects.getByKey(feedback.projectKey);
  if (!project) return c.json({ error: "Unknown project key" }, 401);

  // --- origin allowlist (empty = allow all; absent Origin, e.g. curl = allow) ---
  const origin = c.req.header("origin");
  if (
    origin &&
    project.allowedOrigins.length > 0 &&
    !project.allowedOrigins.includes(origin)
  ) {
    return c.json({ error: "Origin not allowed" }, 403);
  }

  // --- store + persist ---
  const issueId = crypto.randomUUID();
  const storage = getStorage();

  let screenshotKey: string | null = null;
  let cropKey: string | null = null;
  if (screenshot) {
    const screenshotBytes = new Uint8Array(await screenshot.arrayBuffer());
    screenshotKey = `${project.id}/${issueId}/screenshot.png`;
    await storage.put(screenshotKey, screenshotBytes, screenshot.type);

    // Auto-crop the highlighted region into a second image (best-effort).
    if (feedback.region) {
      try {
        const cropBytes = await cropRegion(
          screenshotBytes,
          feedback.region,
          feedback.metadata.viewport.width,
        );
        if (cropBytes) {
          cropKey = `${project.id}/${issueId}/crop.png`;
          await storage.put(cropKey, cropBytes, "image/png");
        }
      } catch (err) {
        console.error("[ingest] region crop failed:", err);
      }
    }
  }

  let videoKey: string | null = null;
  let videoMime: string | null = null;
  let videoBytes: Uint8Array | null = null;
  if (video) {
    const ext = VIDEO_EXT[video.type] ?? "webm";
    videoKey = `${project.id}/${issueId}/recording.${ext}`;
    videoMime = video.type;
    videoBytes = new Uint8Array(await video.arrayBuffer());
    await storage.put(videoKey, videoBytes, video.type);
  }

  let sessionKey: string | null = null;
  if (session) {
    const gz = session.type.includes("gzip");
    sessionKey = `${project.id}/${issueId}/session.json${gz ? ".gz" : ""}`;
    await storage.put(sessionKey, new Uint8Array(await session.arrayBuffer()), session.type);
  }

  let audioKey: string | null = null;
  let audioMime: string | null = null;
  let audioBytes: Uint8Array | null = null;
  if (audio) {
    const ext = AUDIO_EXT[audio.type] ?? "bin";
    audioKey = `${project.id}/${issueId}/audio.${ext}`;
    audioMime = audio.type;
    audioBytes = new Uint8Array(await audio.arrayBuffer());
    await storage.put(audioKey, audioBytes, audio.type);
  }

  const willTranscribeAudio = audioBytes !== null && transcriptionEnabled();
  // The video's mic audio track; whisper takes the webm/mp4 container as-is.
  const willTranscribeVideo = videoBytes !== null && transcriptionEnabled();

  await store.issues.create({
    id: issueId,
    projectId: project.id,
    kind: feedback.kind ?? "bug",
    importance: feedback.kind === "feature" ? (feedback.importance ?? null) : null,
    text: feedback.text ?? null,
    screenshotKey,
    cropKey,
    videoKey,
    videoMime,
    sessionKey,
    audioKey,
    audioMime,
    audioTranscriptStatus: willTranscribeAudio ? "pending" : null,
    videoTranscriptStatus: willTranscribeVideo ? "pending" : null,
    region: feedback.region ?? null,
    metadata: feedback.metadata,
  });

  // In the background: transcription must never delay or fail the submission.
  // Delivery waits for it so the ticket carries the transcript.
  const transcriptions: Promise<void>[] = [];
  if (audioBytes && willTranscribeAudio) {
    transcriptions.push(transcribeAndStore(store, issueId, audioBytes, "audio"));
  }
  if (videoBytes && willTranscribeVideo) {
    transcriptions.push(transcribeAndStore(store, issueId, videoBytes, "video"));
  }
  runInBackground(
    c,
    Promise.allSettled(transcriptions)
      .then(() => deliverIssue(store, issueId))
      .catch((err: unknown) => console.error(`[ingest] delivery failed for ${issueId}:`, err)),
  );

  return c.json({ id: issueId }, 201);
});

async function transcribeAndStore(
  store: Store,
  issueId: string,
  media: Uint8Array,
  kind: "audio" | "video",
): Promise<void> {
  try {
    const text = await transcribeAudio(media);
    await store.issues.setTranscript(issueId, kind, { status: "done", text });
  } catch (err) {
    console.error(`[ingest] ${kind} transcription failed for issue ${issueId}:`, err);
    await store.issues
      .setTranscript(issueId, kind, { status: "failed" })
      .catch((dbErr: unknown) => {
        console.error(`[ingest] failed to mark transcription failed for ${issueId}:`, dbErr);
      });
  }
}
