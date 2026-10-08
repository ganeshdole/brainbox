import type { Identity, Region } from "@brainbox/shared";
import { createAnnotations, type Annotations } from "./annotate.ts";
import { bakeMarks, captureViewport, pickScreenshot } from "./capture.ts";
import { unionBounds, type Mark } from "./marks.ts";
import { captureMetadata } from "./metadata.ts";
import { cssPath, elementAt } from "./selector.ts";
import { startSessionRecording, type SessionRecording } from "./session.ts";
import type { Report, SubmitResult, Transport } from "./transport.ts";

const MAX_SESSION_BYTES = 15 * 1024 * 1024;

/** What a UI needs to know about the report in progress. A new object on every
 *  change, so `useSyncExternalStore` and friends can compare by reference. */
export interface DraftState {
  /** Object URL of the latest screenshot (plain or baked), for previews. */
  screenshotUrl: string | null;
  /** A screenshot, or the bake of the user's marks onto it, is still rendering. */
  screenshotPending: boolean;
  /** The screenshot could not be taken. The report can still go out without it. */
  screenshotFailed: boolean;
  /** A session recording is attached. */
  hasSession: boolean;
  /** Voice was captured during the recording. */
  hasVoice: boolean;
}

const EMPTY: DraftState = {
  screenshotUrl: null,
  screenshotPending: false,
  screenshotFailed: false,
  hasSession: false,
  hasVoice: false,
};

/** A session recording in progress. */
export interface Recording {
  /** Marks drawn into the host page while recording. rrweb records them as
   *  ordinary mutations, so they show up in the replay. */
  annotations: Annotations;
  /** Whether the mic came up (the permission prompt can take a while). */
  micActive(): boolean;
  setMicMuted(muted: boolean): void;
  /** Finish the recording: attach the session and its voice to the draft and
   *  take a last-frame thumbnail. Rejects if the recording is too large. */
  stop(): Promise<void>;
}

export interface DraftOptions {
  /** The UI's own host element, hidden while screenshotting and when reading
   *  which page element sits under the user's marks. */
  exclude?: HTMLElement;
}

/** One feedback report being built. Owns everything that is easy to get wrong
 *  about timing: the screenshot still rendering when the composer opens, the
 *  bake of the marks onto it, and results arriving after the user cancelled. */
export interface Draft {
  getState(): DraftState;
  subscribe(listener: () => void): () => void;
  /** Start rasterising the page now. Rendering a big page takes seconds and
   *  marking it up takes tens of them, so by the time the user is done the
   *  shot is usually waiting. */
  captureScreenshot(): void;
  /** Record what the user drew. The marks' bounds become the report's region,
   *  and the marks are baked onto the screenshot in the background. */
  markUp(marks: Mark[]): void;
  /** Start recording the page. `onAutoStop` fires at the duration cap so the
   *  UI can call `stop()`. */
  startRecording(options?: { onAutoStop?: () => void; maxMs?: number }): Recording;
  /** Send the report. Waits for a bake in flight rather than sending the
   *  un-marked shot. Rejects if there is nothing to send or the transport fails. */
  submit(input: { text?: string; audio?: Blob | null }): Promise<SubmitResult>;
  /** Throw the report away. Late screenshots are dropped, object URLs revoked,
   *  a recording stopped and its marks removed. The draft can be used again. */
  cancel(): void;
}

/** What a draft borrows from its `Brainbox` instance. */
export interface DraftContext {
  transport: Transport;
  identity(): Identity | undefined;
  consoleErrors(): string[];
  onSubmitted?: (result: SubmitResult) => void;
}

export function createDraft(ctx: DraftContext, { exclude }: DraftOptions = {}): Draft {
  const listeners = new Set<() => void>();
  let state = EMPTY;
  const set = (patch: Partial<DraftState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  /** Bumped on every cancel. A capture started for an abandoned run can still
   *  be seconds from settling, and without this its `then` would revive a dead
   *  run's screenshot and strand an object URL nobody is looking at. */
  let run = 0;
  /** The last screenshot that landed - what a preview is already showing. */
  let shot: Blob | null = null;
  /** The freshest screenshot promise. Submit awaits this, not `shot`: leaving
   *  the markup step swaps in the bake while `shot` still holds the plain
   *  capture, and sending that would drop every mark the user drew. */
  let pending: Promise<Blob> | null = null;
  let session: Blob | null = null;
  let voice: Blob | null = null;
  let region: Region | null = null;
  /** The recording in progress: the handle the UI holds and the rrweb
   *  recorder behind it, which `cancel()` has to stop directly. */
  let recording: { handle: Recording; raw: SessionRecording } | null = null;

  const setShot = (blob: Blob) => {
    shot = blob;
    if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
    set({ screenshotUrl: URL.createObjectURL(blob) });
  };

  /** Adopt `next` as the screenshot to send. Pending stays set until it lands,
   *  and only clears if it is still the freshest promise: a bake started in the
   *  meantime has its own `finally` for that. */
  const track = (next: Promise<Blob>, onFail: () => void) => {
    const r = run;
    pending = next;
    set({ screenshotPending: true });
    next
      .then((blob) => {
        if (run === r) setShot(blob);
      })
      .catch(() => {
        if (run === r) onFail();
      })
      .finally(() => {
        if (run === r && pending === next) set({ screenshotPending: false });
      });
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    captureScreenshot() {
      set({ screenshotFailed: false });
      // A failed screenshot must not sink the report - the text and voice
      // note are still worth filing.
      track(captureViewport({ exclude }), () => set({ screenshotFailed: true }));
    },

    markUp(marks) {
      // What the user drew *is* the region, so the issue still records where
      // on the page it happened.
      const bounds = unionBounds(marks);
      if (bounds) {
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        region = { ...bounds, selector: cssPath(elementAt(cx, cy, exclude)) };
      }
      const frozen = pending;
      if (!frozen || marks.length === 0) return;
      // If the bake fails the plain shot is already attached, so the report
      // still goes out - just without the markup.
      track(
        frozen.then((blob) => bakeMarks(blob, marks)),
        () => {},
      );
    },

    startRecording({ onAutoStop, maxMs } = {}) {
      const annotations = createAnnotations();
      const rec = startSessionRecording(() => onAutoStop?.(), maxMs);
      const r = run;

      const handle: Recording = {
        annotations,
        micActive: rec.micActive,
        setMicMuted: rec.setMicMuted,
        async stop() {
          if (recording?.handle !== handle) return;
          recording = null;
          // clear before stop() so the removal lands inside the recording
          annotations.clear();
          const { session: blob, audio } = await rec.stop();
          if (run !== r) return;
          if (blob.size > MAX_SESSION_BYTES) {
            throw new Error("Recording too large - try a shorter clip");
          }
          session = blob;
          voice = audio;
          set({ hasSession: true, hasVoice: audio !== null });
          // Last-frame thumbnail: shown in the composer and uploaded as the
          // report's screenshot so a list view gets a real preview. Best-effort.
          try {
            const thumb = await captureViewport({ exclude });
            if (run === r) setShot(thumb);
          } catch {
            /* the composer falls back to a text note */
          }
        },
      };
      recording = { handle, raw: rec };
      return handle;
    },

    async submit({ text, audio }) {
      const screenshot = await pickScreenshot(pending, shot);
      const body = text?.trim() || undefined;
      const voiceNote = audio ?? voice ?? undefined;
      if (!screenshot && !session && !body && !voiceNote) {
        throw new Error("Nothing to send - record a note or add a description");
      }
      const report: Report = {
        text: body,
        region: region ?? undefined,
        metadata: captureMetadata({
          consoleErrors: ctx.consoleErrors(),
          identity: ctx.identity(),
          selector: region?.selector,
        }),
        screenshot: screenshot ?? undefined,
        session: session ?? undefined,
        audio: voiceNote,
      };
      const result = await ctx.transport.send(report);
      ctx.onSubmitted?.(result);
      return result;
    },

    cancel() {
      run += 1;
      pending = null;
      shot = null;
      session = null;
      voice = null;
      region = null;
      // an abandoned recording must release the mic and the DOM observers
      const rec = recording;
      recording = null;
      if (rec) {
        rec.handle.annotations.clear();
        void rec.raw.stop().catch(() => {});
      }
      if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
      set(EMPTY);
    },
  };
}
