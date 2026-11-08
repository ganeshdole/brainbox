import type { Identity, Importance, IssueKind, Region, ReportField } from "@ganeshdole/brainbox-shared";
import { createAnnotations, type Annotations } from "./annotate.ts";
import { bakeMarks, captureViewport, pickScreenshot, type ScreenshotOptions } from "./capture.ts";
import type { CaptureLoader } from "./loader.ts";
import { unionBounds, type Mark } from "./marks.ts";
import { captureMetadata } from "./metadata.ts";
import type { PrivacyOptions } from "./privacy.ts";
import { cssPath, elementAt } from "./selector.ts";
import {
  startSessionRecording,
  type RecordingOptions,
  type SessionCapture,
  type SessionRecording,
} from "./session.ts";
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
  /** Settles once the page is being recorded, and rejects if the recorder
   *  could not be loaded, so the UI can say so straight away instead of
   *  ticking a clock over nothing until Stop. Ignoring it is fine. */
  ready: Promise<void>;
  /** Marks drawn into the host page while recording. rrweb records them as
   *  ordinary mutations, so they show up in the replay. The ones still in view
   *  at `stop()` also become the report's region and are baked onto its
   *  last-frame thumbnail. */
  annotations: Annotations;
  /** Whether the mic came up (the permission prompt can take a while). */
  micActive(): boolean;
  setMicMuted(muted: boolean): void;
  /** Finish the recording: attach the session and its voice to the draft and
   *  take a last-frame thumbnail. Rejects if the recording is too large or
   *  rrweb never loaded. Safe to call more than once (the cap firing as the
   *  user clicks Stop): every call gets the first call's promise. A recording
   *  that caught no events (Stop beat the recorder) attaches no session. */
  stop(): Promise<void>;
}

export interface DraftOptions {
  /** The UI's own host element, left out of screenshots and hidden when
   *  reading which page element sits under the user's marks. */
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
   *  UI can call `stop()`. `audio` overrides the instance's `recording.audio`
   *  for this one recording. Throws while another recording on this draft is
   *  still running or stopping: a second one would leave the first one's
   *  observers and mic running with nothing to stop them. */
  startRecording(options?: { onAutoStop?: () => void; maxMs?: number; audio?: boolean }): Recording;
  /** Send the report. Waits for a bake in flight rather than sending the
   *  un-marked shot. Rejects if there is nothing to send, `beforeSend` drops
   *  it, or the transport fails. A feature request (`kind: "feature"`) needs
   *  text or a voice note; its screenshot is optional and its console errors
   *  are left out.
   *
   *  One report, sent once. It also rejects, without sending, while a
   *  recording is running or stopping (stop it first), while an earlier
   *  `submit` on this draft is still in flight, after one has succeeded (call
   *  `cancel()` to start the next report), and when `cancel()` lands before
   *  the transport is reached. A failed submit leaves the draft as it was, so
   *  it can be tried again. */
  submit(input: SubmitInput): Promise<SubmitResult>;
  /** Throw the report away. Late screenshots are dropped, object URLs revoked,
   *  a recording stopped and its marks removed, and a submit that has not yet
   *  reached the transport rejects instead of sending. The draft can be used
   *  again, including after a successful submit. */
  cancel(): void;
}

/** What the user said, and what kind of report it is. */
export interface SubmitInput {
  text?: string;
  audio?: Blob | null;
  /** Default `bug`. */
  kind?: IssueKind;
  /** Only sent with a feature request. */
  importance?: Importance;
}

/** What a draft borrows from its `Brainbox` instance. */
export interface DraftContext {
  transport: Transport;
  identity(): Identity | undefined;
  fields(): ReportField[] | undefined;
  consoleErrors(): string[];
  privacy?: PrivacyOptions;
  screenshot?: ScreenshotOptions;
  recording?: RecordingOptions;
  loader?: CaptureLoader;
  beforeSend?: BeforeSend;
  onSubmitted?: (result: SubmitResult) => void;
}

/** Sees every report before the transport does. Return it, changed or not, to
 *  send it, or null to send nothing. */
export type BeforeSend = (report: Report) => Report | null | Promise<Report | null>;

export function createDraft(ctx: DraftContext, { exclude }: DraftOptions = {}): Draft {
  const { privacy, screenshot, recording: recordingOptions, loader } = ctx;
  const shoot = () => captureViewport({ ...screenshot, exclude, privacy, loader });
  const bake = (blob: Blob, marks: Mark[]) =>
    bakeMarks(blob, marks, { maxBytes: screenshot?.maxBytes });
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
  /** The unmarked capture the marks are baked onto. Every `markUp` bakes onto
   *  this, never onto an earlier bake, so marking up twice doesn't stack the
   *  first set of marks under the second. */
  let base: Promise<Blob> | null = null;
  let session: Blob | null = null;
  let voice: Blob | null = null;
  let region: Region | null = null;
  /** The recording in progress, until its `stop()` has attached the session:
   *  the handle the UI holds and the rrweb recorder behind it, which
   *  `cancel()` has to stop directly. */
  let recording: { handle: Recording; raw: SessionRecording } | null = null;
  /** The run whose `submit` is in flight, so a second one can't send twice. */
  let submitting: number | null = null;
  /** The run whose report went out. It is not sent again until `cancel()`. */
  let sent: number | null = null;

  /** The area `marks` cover (viewport coordinates) and the element under
   *  its middle, or null when there are none. */
  const regionOf = (marks: Mark[]): Region | null => {
    const bounds = unionBounds(marks);
    if (!bounds) return null;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return { ...bounds, selector: cssPath(elementAt(cx, cy, exclude)) };
  };

  const setShot = (blob: Blob) => {
    shot = blob;
    if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
    set({ screenshotUrl: URL.createObjectURL(blob) });
  };

  /** Adopt `next` as the screenshot to send. Its result only counts while it
   *  is still the freshest promise of this run: an older capture or bake that
   *  settles late must neither replace a newer shot nor flag a failure beside
   *  one. Pending clears with the freshest promise, too. */
  const track = (next: Promise<Blob>, onFail: () => void) => {
    const r = run;
    const current = () => run === r && pending === next;
    pending = next;
    set({ screenshotPending: true });
    next
      .then((blob) => {
        if (current()) setShot(blob);
      })
      .catch(() => {
        if (current()) onFail();
      })
      .finally(() => {
        if (current()) set({ screenshotPending: false });
      });
  };
  const failShot = () => set({ screenshotFailed: true });

  /** Throws if `cancel()` has started another run since `r`: whatever the
   *  user threw away must not go out. */
  const stillLive = (r: number) => {
    if (run !== r) throw new Error("This report was cancelled");
  };

  /** Build the report and hand it to the transport, for the run `r`. */
  const send = async (
    { text, audio, kind = "bug", importance }: SubmitInput,
    r: number,
  ): Promise<SubmitResult> => {
    const screenshot = await pickScreenshot(pending, shot);
    stillLive(r);
    const body = text?.trim() || undefined;
    const voiceNote = audio ?? voice ?? undefined;
    const feature = kind === "feature";
    // A bug can be shown without a word; a feature request has to be told.
    if (feature ? !body && !voiceNote : !screenshot && !session && !body && !voiceNote) {
      throw new Error(
        feature
          ? "Nothing to send - say or type what you'd like"
          : "Nothing to send - record a note or add a description",
      );
    }
    const report: Report = {
      ...(feature && { kind, importance }),
      text: body,
      region: region ?? undefined,
      metadata: captureMetadata({
        // Errors on the page say nothing about an idea, and would read as a bug.
        consoleErrors: feature ? [] : ctx.consoleErrors(),
        identity: ctx.identity(),
        fields: ctx.fields(),
        selector: region?.selector,
      }),
      screenshot: screenshot ?? undefined,
      session: session ?? undefined,
      audio: voiceNote,
    };
    // The host's last word: scrub what it may not send, or drop the report.
    const outgoing = ctx.beforeSend ? await ctx.beforeSend(report) : report;
    if (!outgoing) throw new Error("This report was not sent");
    stillLive(r);
    // Past this point the report is out: there is no taking it back, so a
    // cancel that lands mid-request doesn't hide that it was sent.
    return ctx.transport.send(outgoing);
  };

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    captureScreenshot() {
      set({ screenshotFailed: false });
      base = shoot();
      // A failed screenshot must not sink the report - the text and voice
      // note are still worth filing.
      track(base, failShot);
    },

    markUp(marks) {
      // What the user drew *is* the region, so the issue still records where
      // on the page it happened.
      region = regionOf(marks) ?? region;
      const plain = base;
      if (!plain || marks.length === 0) return;
      // If the bake fails the report goes out with the plain shot - just
      // without the markup. Only a failed capture fails this.
      track(
        plain.then((blob) => bake(blob, marks).catch(() => blob)),
        failShot,
      );
    },

    startRecording({ onAutoStop, maxMs, audio } = {}) {
      if (recording) throw new Error("A recording is already running - stop it first");
      const annotations = createAnnotations();
      const rec = startSessionRecording({
        ...recordingOptions,
        audio: audio ?? recordingOptions?.audio,
        onAutoStop: () => onAutoStop?.(),
        maxMs,
        privacy,
        loader,
      });
      const r = run;

      const finish = async () => {
        // The marks come off the page only after the recorder has stopped,
        // so the replay ends with them on screen. The ones in view are the
        // report's annotations, as the markup step's are for a screenshot:
        // they bound its region and are baked onto its last frame.
        let marks: Mark[];
        let captured: SessionCapture;
        try {
          captured = await rec.stop();
        } finally {
          marks = annotations.inView();
          annotations.clear();
          // Stopped, one way or another: submit and a new recording may go.
          if (recording?.handle === handle) recording = null;
        }
        if (run !== r) return;
        const { session: blob, audio, events } = captured;
        if (blob.size > MAX_SESSION_BYTES) {
          throw new Error("Recording too large - try a shorter clip");
        }
        // A Stop that beat the recorder leaves an empty log: nothing to
        // replay, so not a session, and not enough on its own to send.
        const caught = events > 0;
        session = caught ? blob : null;
        voice = audio;
        region = regionOf(marks);
        set({ hasSession: caught, hasVoice: audio !== null });
        // Last-frame thumbnail: shown in the composer and uploaded as the
        // report's screenshot so a list view gets a real preview. Tracked like
        // any screenshot, so submit waits for it. Best-effort, and a failed
        // bake still leaves the plain frame.
        const thumb = shoot().then((frame) => bake(frame, marks).catch(() => frame));
        base = thumb;
        track(thumb, () => {
          /* the composer falls back to a text note */
        });
        await thumb.catch(() => {});
      };
      let stopping: Promise<void> | null = null;
      const handle: Recording = {
        ready: rec.ready,
        annotations,
        micActive: rec.micActive,
        setMicMuted: rec.setMicMuted,
        stop() {
          stopping ??= finish();
          return stopping;
        },
      };
      recording = { handle, raw: rec };
      return handle;
    },

    async submit(input) {
      const r = run;
      if (recording) throw new Error("Stop the recording before sending");
      if (submitting === r) throw new Error("This report is already being sent");
      if (sent === r) throw new Error("This report was already sent - start a new one");
      submitting = r;
      try {
        const result = await send(input, r);
        // Sent before anything else runs: a host hook that throws below must
        // not make the report look unsent, or a retry would file it twice.
        if (run === r) sent = r;
        try {
          ctx.onSubmitted?.(result);
        } catch (err) {
          console.error("[brainbox] onSubmitted threw", err);
        }
        return result;
      } finally {
        if (submitting === r) submitting = null;
      }
    },

    cancel() {
      run += 1;
      pending = null;
      base = null;
      shot = null;
      session = null;
      voice = null;
      region = null;
      submitting = null;
      sent = null;
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
