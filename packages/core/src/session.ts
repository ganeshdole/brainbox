import type { eventWithTime, recordOptions } from "rrweb";
import { startAudioRecording, type AudioRecorder } from "./audio.ts";
import { defaultCaptureLoader, type CaptureLoader } from "./loader.ts";
import {
  BLOCK_CLASS,
  IGNORE_CLASS,
  MASK_CLASS,
  recordMaskOptions,
  type PrivacyOptions,
} from "./privacy.ts";

export interface SessionCapture {
  session: Blob;
  audio: Blob | null;
}

/** rrweb `record()` options a host may add or override (`sampling`,
 *  `slimDOMOptions`, `recordCanvas`, `blockSelector`, ...). `emit` belongs to
 *  the engine, and input and text masking go through `privacy`, so those
 *  cannot be loosened from here. */
export type RrwebRecordOptions = Omit<
  recordOptions<eventWithTime>,
  | "emit"
  | "maskAllInputs"
  | "maskInputOptions"
  | "maskInputFn"
  | "maskTextFn"
  | "maskTextSelector"
  | "maskTextClass"
  | "blockClass"
  | "ignoreClass"
>;

/** How recordings are made, for every draft of an instance. */
export interface RecordingOptions {
  /** Ask for the mic and record narration with the session. Default true;
   *  false never shows the permission prompt. */
  audio?: boolean;
  /** Extra rrweb options, laid over the engine's defaults. */
  rrweb?: RrwebRecordOptions;
}

export interface SessionRecordingOptions extends RecordingOptions {
  /** Fires at the `maxMs` cap, so the caller can finish with `stop()`. */
  onAutoStop?: () => void;
  /** The longest a recording runs. Default 60 000 ms. */
  maxMs?: number;
  /** Mask more text than `.rr-mask`. */
  privacy?: PrivacyOptions;
  /** Where rrweb comes from. Default `defaultCaptureLoader`. */
  loader?: CaptureLoader;
}

/** A recording in progress. */
export interface SessionRecording {
  /** Finish: the gzipped rrweb event log and the narration, if any. */
  stop: () => Promise<SessionCapture>;
  /** Whether the mic came up (the permission prompt can take a while). */
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
 *  browser; customers can add `.rr-block` / `.rr-mask` / `.rr-ignore`, or mask
 *  more text through `privacy`.
 *  Voice narration via the mic is best-effort: the user may deny the prompt
 *  (or dismiss it) and the DOM recording carries on without audio.
 *  `onAutoStop` fires at the max-duration cap so the caller finalizes via stop(). */
export function startSessionRecording({
  onAutoStop = () => {},
  maxMs = 60_000,
  privacy,
  audio: withAudio = true,
  rrweb,
  loader = defaultCaptureLoader,
}: SessionRecordingOptions = {}): SessionRecording {
  const events: unknown[] = [];
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let settling = false;
  const fire = () => {
    if (settling) return;
    settling = true;
    onAutoStop();
  };
  let stopped = false;
  // rrweb loads on first use (loader.ts). The session's clock, the mic and the
  // duration cap all start with the recorder, not before it: the replay's
  // timeline begins at rrweb's first event, and `audioOffsetMs` is measured
  // against it. A Stop that beats the load never starts the recorder at all.
  const recorder = loader.recorder().then(({ record }) => {
    if (stopped) return undefined;
    startedAt = Date.now();
    timer = setTimeout(fire, maxMs);
    return record({
      recordCanvas: false,
      collectFonts: false,
      ...rrweb,
      emit(event) {
        events.push(event);
      },
      // privacy: never let typed values (passwords, emails, PII) leave as
      // plaintext. Spread after the host's options, so a key the type leaves
      // out cannot slip in from plain JS either.
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true, tel: true },
      maskInputFn: undefined,
      maskTextFn: undefined,
      blockClass: BLOCK_CLASS,
      ignoreClass: IGNORE_CLASS,
      maskTextClass: MASK_CLASS,
      maskTextSelector: undefined,
      ...recordMaskOptions(privacy),
    });
  });

  let mic: AudioRecorder | null = null;
  let micStartedAt: number | null = null;
  let muted = false;
  const applyMute = () => {
    mic?.stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  };
  const micReady = recorder
    .then((started) => (started && withAudio ? startAudioRecording() : null))
    .then((r) => {
      if (!r) return;
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
      (await recorder)?.();
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
