import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrainbox, type Brainbox } from "./brainbox.ts";
import type { CaptureLoader } from "./loader.ts";
import type { Mark } from "./marks.ts";
import type { SessionRecordingOptions } from "./session.ts";
import type { Report, Transport } from "./transport.ts";

// jsdom has no screenshotting; the capture module is swapped for promises the
// tests settle by hand so the timing cases can be driven exactly.
const capture = vi.hoisted(() => ({
  captureViewport: vi.fn<() => Promise<Blob>>(),
  bakeMarks: vi.fn<(shot: Blob, marks: Mark[]) => Promise<Blob>>(),
}));
vi.mock("./capture.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture.ts")>()),
  captureViewport: capture.captureViewport,
  bakeMarks: capture.bakeMarks,
}));

const recorder = vi.hoisted(() => ({
  start: vi.fn<(options: SessionRecordingOptions) => void>(),
  stop: vi.fn<() => Promise<{ session: Blob; audio: Blob | null }>>(),
}));
vi.mock("./session.ts", () => ({
  canSessionRecord: () => true,
  startSessionRecording: (options: SessionRecordingOptions) => {
    recorder.start(options);
    return {
      stop: recorder.stop,
      micActive: () => true,
      setMicMuted: () => {},
    };
  },
}));

/** A promise settled from outside. */
function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const blob = (tag: string) => new Blob([tag], { type: "image/png" });
const box: Mark = { kind: "box", id: "b", color: "#f00", x: 10, y: 20, width: 100, height: 50 };
const flush = () => new Promise((r) => setTimeout(r, 0));

const sent: Report[] = [];
const send = vi.fn(async (report: Report) => {
  sent.push(report);
  return { id: "issue-1" };
});
const transport: Transport = { send };

const originalConsoleError = console.error;
let urls = 0;
const createObjectURL = vi.fn(() => `blob:${++urls}`);
const revokeObjectURL = vi.fn();
let bb: Brainbox;

beforeEach(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  // jsdom does no layout, so there is nothing under a point; the real thing is
  // covered by selector.test.ts.
  document.elementFromPoint = () => document.body;
  urls = 0;
  sent.length = 0;
  send.mockClear();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  capture.captureViewport.mockReset();
  capture.bakeMarks.mockReset();
  recorder.start.mockReset();
  recorder.stop.mockReset();
  bb = createBrainbox({ transport });
});

afterEach(() => {
  bb.destroy();
});

describe("Draft screenshots", () => {
  it("publishes the shot when it lands and clears pending", async () => {
    const shot = deferred<Blob>();
    capture.captureViewport.mockReturnValue(shot.promise);
    const draft = bb.draft();
    const seen: boolean[] = [];
    draft.subscribe(() => seen.push(draft.getState().screenshotPending));

    draft.captureScreenshot();
    expect(draft.getState().screenshotPending).toBe(true);

    shot.resolve(blob("plain"));
    await flush();
    expect(draft.getState()).toMatchObject({
      screenshotUrl: "blob:1",
      screenshotPending: false,
      screenshotFailed: false,
    });
    expect(seen.at(-1)).toBe(false);
  });

  it("submits the baked shot when the bake is still in flight", async () => {
    capture.captureViewport.mockResolvedValue(blob("plain"));
    const bake = deferred<Blob>();
    capture.bakeMarks.mockReturnValue(bake.promise);
    const baked = blob("baked");
    const draft = bb.draft();

    draft.captureScreenshot();
    await flush();
    draft.markUp([box]);
    expect(draft.getState().screenshotPending).toBe(true);

    const submitted = draft.submit({ text: "hi" });
    bake.resolve(baked);
    await submitted;

    expect(sent[0]?.screenshot).toBe(baked);
    expect(sent[0]?.region).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
    expect(sent[0]?.region?.selector).toBe("html > body");
    expect(sent[0]?.metadata.selector).toBe("html > body");
    // the plain shot's URL was handed back when the bake replaced it
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("falls back to the plain shot when the bake fails", async () => {
    const plain = blob("plain");
    capture.captureViewport.mockResolvedValue(plain);
    capture.bakeMarks.mockRejectedValue(new Error("no canvas"));
    const draft = bb.draft();

    draft.captureScreenshot();
    await flush();
    draft.markUp([box]);
    await draft.submit({});

    expect(sent[0]?.screenshot).toBe(plain);
    expect(draft.getState().screenshotFailed).toBe(false);
  });

  it("flags a failed capture but still lets the report go out", async () => {
    capture.captureViewport.mockRejectedValue(new Error("timeout"));
    const draft = bb.draft();

    draft.captureScreenshot();
    await flush();
    expect(draft.getState()).toMatchObject({ screenshotFailed: true, screenshotPending: false });

    await draft.submit({ text: "still worth filing" });
    expect(sent[0]?.screenshot).toBeUndefined();
    expect(sent[0]?.text).toBe("still worth filing");
  });

  it("drops a shot that lands after cancel", async () => {
    const shot = deferred<Blob>();
    capture.captureViewport.mockReturnValue(shot.promise);
    const draft = bb.draft();

    draft.captureScreenshot();
    draft.cancel();
    shot.resolve(blob("late"));
    await flush();

    expect(draft.getState().screenshotUrl).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("hands the object URL back on cancel", async () => {
    capture.captureViewport.mockResolvedValue(blob("plain"));
    const draft = bb.draft();
    draft.captureScreenshot();
    await flush();

    draft.cancel();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    expect(draft.getState().screenshotUrl).toBeNull();
  });
});

describe("Draft recordings", () => {
  it("attaches the session and voice, clears its marks, and takes a thumbnail", async () => {
    const events = blob("events");
    const voice = blob("voice");
    const thumb = blob("thumb");
    recorder.stop.mockResolvedValue({ session: events, audio: voice });
    capture.captureViewport.mockResolvedValue(thumb);
    const draft = bb.draft();

    const rec = draft.startRecording();
    rec.annotations.show(box);
    expect(document.querySelectorAll("[data-brainbox-highlight]")).toHaveLength(1);

    const baked = blob("baked");
    capture.bakeMarks.mockResolvedValue(baked);
    await rec.stop();

    expect(document.querySelectorAll("[data-brainbox-highlight]")).toHaveLength(0);
    // the marks in view are painted onto the last frame, not left to the DOM
    expect(capture.bakeMarks).toHaveBeenCalledWith(thumb, [box], {});
    expect(draft.getState()).toMatchObject({
      hasSession: true,
      hasVoice: true,
      screenshotUrl: "blob:1",
    });
    await draft.submit({});
    expect(sent[0]?.session).toBe(events);
    expect(sent[0]?.audio).toBe(voice);
    expect(sent[0]?.screenshot).toBe(baked);
    // the marks in view are the report's region, as on a screenshot
    expect(sent[0]?.region).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("leaves the region out when nothing drawn is in view", async () => {
    recorder.stop.mockResolvedValue({ session: blob("events"), audio: null });
    capture.captureViewport.mockResolvedValue(blob("thumb"));
    const draft = bb.draft();

    const rec = draft.startRecording();
    rec.annotations.show({ ...box, y: window.innerHeight + 100 });
    await rec.stop();

    await draft.submit({});
    expect(sent[0]?.region).toBeUndefined();
  });

  it("clears its marks even when the recording is rejected", async () => {
    recorder.stop.mockResolvedValue({ session: new Blob([new Uint8Array(16 * 1024 * 1024)]), audio: null });
    const draft = bb.draft();
    const rec = draft.startRecording();
    rec.annotations.show(box);

    await expect(rec.stop()).rejects.toThrow("too large");
    expect(document.querySelectorAll("[data-brainbox-highlight]")).toHaveLength(0);
  });

  it("rejects a recording over the size cap", async () => {
    const huge = new Blob([new Uint8Array(16 * 1024 * 1024)]);
    recorder.stop.mockResolvedValue({ session: huge, audio: null });
    const draft = bb.draft();

    await expect(draft.startRecording().stop()).rejects.toThrow("too large");
    expect(draft.getState().hasSession).toBe(false);
  });

  it("cancel stops an in-flight recording and removes its marks", async () => {
    recorder.stop.mockResolvedValue({ session: blob("events"), audio: null });
    const draft = bb.draft();
    const rec = draft.startRecording();
    rec.annotations.show(box);

    draft.cancel();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-brainbox-highlight]")).toHaveLength(0);
    // the late result from the stopped recorder does not revive the run
    await flush();
    expect(draft.getState().hasSession).toBe(false);
  });
});

describe("Draft submit", () => {
  it("refuses an empty report", async () => {
    const draft = bb.draft();
    await expect(draft.submit({ text: "   " })).rejects.toThrow("Nothing to send");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a voice note on its own", async () => {
    const draft = bb.draft();
    const note = blob("note");
    const result = await draft.submit({ audio: note });
    expect(result).toEqual({ id: "issue-1" });
    expect(sent[0]?.audio).toBe(note);
  });

  it("carries the instance's identity and console errors in the metadata", async () => {
    const other = createBrainbox({ transport });
    bb.identify({ id: "u1", email: "a@b.c" });
    console.error("seen-by-both");
    other.destroy();
    console.error("seen-by-bb-only");

    await bb.draft().submit({ text: "x" });

    expect(sent[0]?.metadata.identity).toEqual({ id: "u1", email: "a@b.c" });
    expect(sent[0]?.metadata.consoleErrors).toEqual(["seen-by-both", "seen-by-bb-only"]);
  });

  it("carries the app's latest fields, and leaves an empty list out", async () => {
    bb.setFields([{ label: "Clinic", value: "Acme Vet" }]);
    bb.setFields([{ label: "Clinic", value: "Northside Vet" }]);
    await bb.draft().submit({ text: "x" });
    bb.setFields([]);
    await bb.draft().submit({ text: "y" });

    expect(sent[0]?.metadata.fields).toEqual([{ label: "Clinic", value: "Northside Vet" }]);
    expect(sent[1]?.metadata).not.toHaveProperty("fields");
  });

  it("sends a feature request with its importance, a screenshot only if taken, and no console errors", async () => {
    console.error("unrelated page error");
    await bb.draft().submit({ text: "Export to CSV", kind: "feature", importance: "important" });

    expect(sent[0]).toMatchObject({ kind: "feature", importance: "important", text: "Export to CSV" });
    expect(sent[0]?.screenshot).toBeUndefined();
    expect(sent[0]?.metadata.consoleErrors).toEqual([]);
  });

  it("refuses a feature request with no words, even with a screenshot", async () => {
    capture.captureViewport.mockResolvedValue(blob("shot"));
    const draft = bb.draft();
    draft.captureScreenshot();
    await expect(draft.submit({ text: " ", kind: "feature" })).rejects.toThrow(
      "say or type what you'd like",
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves kind and importance off a bug report", async () => {
    await bb.draft().submit({ text: "broken", importance: "critical" });
    expect(sent[0]).not.toHaveProperty("kind");
    expect(sent[0]).not.toHaveProperty("importance");
  });

  it("reports a successful submit to the instance", async () => {
    const onSubmitted = vi.fn();
    const withHook = createBrainbox({ transport, onSubmitted });
    await withHook.draft().submit({ text: "x" });
    expect(onSubmitted).toHaveBeenCalledWith({ id: "issue-1" });
    withHook.destroy();
  });
});

describe("Draft privacy", () => {
  it("lets beforeSend scrub the report on its way to the transport", async () => {
    const scrubbing = createBrainbox({
      transport,
      beforeSend: async (report) => ({
        ...report,
        metadata: {
          ...report.metadata,
          url: report.metadata.url.split("?")[0] ?? "",
          consoleErrors: [],
          identity: undefined,
        },
      }),
    });
    scrubbing.identify({ email: "patient@clinic.example" });
    console.error("MRN 12345 not found");
    await scrubbing.draft().submit({ text: "x" });
    scrubbing.destroy();

    expect(sent[0]?.text).toBe("x");
    expect(sent[0]?.metadata.consoleErrors).toEqual([]);
    expect(sent[0]?.metadata.identity).toBeUndefined();
    expect(sent[0]?.metadata.url).not.toContain("?");
  });

  it("sends nothing, and says so, when beforeSend drops the report", async () => {
    const onSubmitted = vi.fn();
    const dropping = createBrainbox({ transport, beforeSend: () => null, onSubmitted });
    await expect(dropping.draft().submit({ text: "x" })).rejects.toThrow("not sent");
    dropping.destroy();
    expect(send).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("hands the privacy options to every screenshot", async () => {
    const privacy = { maskAllText: true, maskScreenshots: true };
    const masked = createBrainbox({ transport, privacy });
    capture.captureViewport.mockResolvedValue(blob("shot"));
    const exclude = document.createElement("div");
    masked.draft({ exclude }).captureScreenshot();
    masked.destroy();
    expect(capture.captureViewport).toHaveBeenCalledWith(expect.objectContaining({ exclude, privacy }));
  });
});

describe("Brainbox destroy", () => {
  it("restores console.error and cancels live drafts", async () => {
    const shot = deferred<Blob>();
    capture.captureViewport.mockReturnValue(shot.promise);
    const draft = bb.draft();
    draft.captureScreenshot();
    expect(console.error).not.toBe(originalConsoleError);

    bb.destroy();

    expect(console.error).toBe(originalConsoleError);
    shot.resolve(blob("late"));
    await flush();
    expect(draft.getState().screenshotUrl).toBeNull();
  });
});

describe("Brainbox options", () => {
  const loader: CaptureLoader = {
    recorder: vi.fn(() => new Promise<never>(() => {})),
    rasteriser: vi.fn(() => new Promise<never>(() => {})),
  };
  beforeEach(() => {
    recorder.stop.mockResolvedValue({ session: blob("session"), audio: null });
  });

  it("leaves console.error alone with consoleErrors off, and sends none", async () => {
    bb.destroy();
    bb = createBrainbox({ transport, consoleErrors: false });
    expect(console.error).toBe(originalConsoleError);
    console.error = () => {}; // keep the test output clean
    try {
      window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    } finally {
      console.error = originalConsoleError;
    }
    await bb.draft().submit({ text: "x" });
    expect(sent[0]?.metadata.consoleErrors).toEqual([]);
  });

  it("hands the screenshot tuning and the loader to every capture and bake", async () => {
    const screenshot = { maxScale: 1, assetTimeoutMs: 2000, maxBytes: 1024 };
    const tuned = createBrainbox({ transport, screenshot, loader });
    capture.captureViewport.mockResolvedValue(blob("plain"));
    capture.bakeMarks.mockResolvedValue(blob("baked"));
    const draft = tuned.draft();
    draft.captureScreenshot();
    draft.markUp([box]);
    await flush();
    tuned.destroy();
    expect(capture.captureViewport).toHaveBeenCalledWith({ ...screenshot, loader });
    expect(capture.bakeMarks).toHaveBeenCalledWith(expect.any(Blob), [box], { maxBytes: 1024 });
  });

  it("records without audio and with the host's rrweb options when asked", () => {
    const rrweb = { recordCanvas: true };
    const quiet = createBrainbox({ transport, recording: { audio: false, rrweb }, loader });
    quiet.draft().startRecording({ maxMs: 5_000 });
    // one recording can still ask for the mic
    quiet.draft().startRecording({ audio: true });
    quiet.destroy();
    expect(recorder.start.mock.calls[0]?.[0]).toMatchObject({
      audio: false,
      rrweb,
      maxMs: 5_000,
      loader,
    });
    expect(recorder.start.mock.calls[1]?.[0]).toMatchObject({ audio: true, rrweb });
  });

  it("records with the mic by default", () => {
    bb.draft().startRecording();
    // left unset, so startSessionRecording's own default (on) applies
    expect(recorder.start.mock.calls[0]?.[0].audio).toBeUndefined();
  });

  it("preloads through the instance's loader", () => {
    const preloading = createBrainbox({ transport, loader });
    preloading.preloadCapture();
    preloading.destroy();
    expect(loader.recorder).toHaveBeenCalled();
    expect(loader.rasteriser).toHaveBeenCalled();
  });
});
