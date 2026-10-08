import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrainbox, type Brainbox } from "./brainbox.ts";
import type { Mark } from "./marks.ts";
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
  stop: vi.fn<() => Promise<{ session: Blob; audio: Blob | null }>>(),
}));
vi.mock("./session.ts", () => ({
  canSessionRecord: () => true,
  startSessionRecording: () => ({
    stop: recorder.stop,
    micActive: () => true,
    setMicMuted: () => {},
  }),
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

    await rec.stop();

    expect(document.querySelectorAll("[data-brainbox-highlight]")).toHaveLength(0);
    expect(draft.getState()).toMatchObject({
      hasSession: true,
      hasVoice: true,
      screenshotUrl: "blob:1",
    });
    await draft.submit({});
    expect(sent[0]?.session).toBe(events);
    expect(sent[0]?.audio).toBe(voice);
    expect(sent[0]?.screenshot).toBe(thumb);
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

  it("reports a successful submit to the instance", async () => {
    const onSubmitted = vi.fn();
    const withHook = createBrainbox({ transport, onSubmitted });
    await withHook.draft().submit({ text: "x" });
    expect(onSubmitted).toHaveBeenCalledWith({ id: "issue-1" });
    withHook.destroy();
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
