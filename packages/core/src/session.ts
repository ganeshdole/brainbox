import { record } from "rrweb";
import { startAudioRecording, type AudioRecorder } from "./audio.ts";

export interface SessionCapture {
  session: Blob;
  audio: Blob | null;
}

export interface SessionRecording {
  stop: () => Promise<SessionCapture>;
  micActive: () => boolean;
  /** Mute/unmute narration mid-recording. Implemented by disabling the audio
   *  track rather than stopping the recorder: the track keeps producing (now
   *  silent) frames, so the audio stays the same length as the replay and
   *  `audioOffsetMs` still lines the two up. Stopping and restarting would
   *  punch a hole in the timeline. */
  setMicMuted: (muted: boolean) => void;
}

/** rrweb DOM recording works wherever MutationObserver exists (universal). */
export function canSessionRecord(): boolean {
  return typeof MutationObserver === "function";
}

/** Record the host app's DOM as an rrweb session - captures only this page.
 *  Private by default: input values are masked before anything leaves the
 *  browser; customers can add `.rr-block` / `.rr-mask` / `.rr-ignore`.
 *  Voice narration via the mic is best-effort: the user may deny the prompt
 *  (or dismiss it) and the DOM recording carries on without audio.
 *  `onAutoStop` fires at the max-duration cap so the caller finalizes via stop(). */
export function startSessionRecording(onAutoStop: () => void, maxMs = 60_000): SessionRecording {
  const events: unknown[] = [];
  const startedAt = Date.now();

  const stopFn = record({
    emit(event) {
      events.push(event);
    },
    // privacy: never let typed values (passwords, emails, PII) leave as plaintext
    maskAllInputs: true,
    maskInputOptions: { password: true, email: true, tel: true },
    blockClass: "rr-block",
    ignoreClass: "rr-ignore",
    maskTextClass: "rr-mask",
    recordCanvas: false,
    collectFonts: false,
  });

  let mic: AudioRecorder | null = null;
  let micStartedAt: number | null = null;
  let stopped = false;
  let muted = false;
  const applyMute = () => {
    mic?.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  };
  const micReady = startAudioRecording()
    .then((r) => {
      // permission granted after Stop was already pressed - release the mic
      if (stopped) void r.stop();
      else {
        mic = r;
        micStartedAt = Date.now();
        // the user may have muted while the permission prompt was still up
        applyMute();
      }
    })
    .catch(() => {
      /* denied or no mic - session recording continues without voice */
    });

  let settling = false;
  const fire = () => {
    if (settling) return;
    settling = true;
    onAutoStop();
  };
  const timer = setTimeout(fire, maxMs);

  return {
    micActive: () => mic !== null,
    setMicMuted: (next: boolean) => {
      muted = next;
      applyMute();
    },
    stop: async () => {
      clearTimeout(timer);
      settling = true;
      stopped = true;
      stopFn?.();
      // don't block the upload on a permission dialog the user never answered
      await Promise.race([micReady, new Promise((r) => setTimeout(r, 150))]);
      const audio = mic ? await mic.stop() : null;
      const offset = audio ? micOffsetMs(startedAt, micStartedAt) : null;
      const payload =
        offset === null ? { v: 1, events } : { v: 1, events, audioOffsetMs: offset };
      return { session: await gzipJson(JSON.stringify(payload)), audio };
    },
  };
}

/** How far into the session the mic actually started (the permission prompt
 *  delays it) - stored in the log so the dashboard can sync voice to replay. */
export function micOffsetMs(
  sessionStartedAt: number,
  micStartedAt: number | null,
): number | null {
  if (micStartedAt === null) return null;
  return Math.max(0, micStartedAt - sessionStartedAt);
}

/** Gzip the event log so the upload stays small (rrweb JSON compresses ~10x). */
async function gzipJson(json: string): Promise<Blob> {
  const raw = new Blob([json], { type: "application/json" });
  if (typeof CompressionStream === "undefined") return raw;
  const stream = raw.stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).blob();
  return new Blob([compressed], { type: "application/gzip" });
}
