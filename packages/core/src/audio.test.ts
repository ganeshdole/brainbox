import { afterEach, describe, expect, it, vi } from "vitest";
import { STOP_GRACE_MS, startAudioRecording } from "./audio.ts";

// jsdom has neither a mic nor MediaRecorder; both are stood in for here.
const trackStop = vi.fn();
const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;

class FakeRecorder {
  static isTypeSupported = () => true;
  static throwOnCreate = false;
  /** A recorder that never reports back from stop(). */
  static silent = false;
  static last: FakeRecorder | null = null;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  state: "inactive" | "recording" = "inactive";
  stops = 0;
  constructor() {
    if (FakeRecorder.throwOnCreate) throw new Error("NotSupportedError");
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.stops += 1;
    // a real MediaRecorder ignores stop() once inactive
    if (this.state === "inactive") return;
    this.state = "inactive";
    if (FakeRecorder.silent) return;
    queueMicrotask(() => this.finish());
  }
  /** What the browser does when the recorder stops, by request or not. */
  finish() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"]) });
    this.onstop?.();
  }
}

function stubMedia() {
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
}

afterEach(() => {
  vi.unstubAllGlobals();
  trackStop.mockClear();
  FakeRecorder.throwOnCreate = false;
  FakeRecorder.silent = false;
  vi.useRealTimers();
});

describe("startAudioRecording", () => {
  it("resolves every stop() with the one clip", async () => {
    stubMedia();
    const rec = await startAudioRecording();
    const first = rec.stop();
    const second = rec.stop();
    expect(second).toBe(first);
    expect((await first).size).toBeGreaterThan(0);
    // a late caller still gets an answer rather than a promise that never settles
    await expect(rec.stop()).resolves.toBe(await first);
    expect(trackStop).toHaveBeenCalledOnce();
  });

  it("hands over what was caught when the mic went away before stop()", async () => {
    stubMedia();
    const rec = await startAudioRecording();
    // the headset disconnects: the track ends and the recorder stops itself
    FakeRecorder.last?.finish();
    const clip = await rec.stop();
    expect(clip.size).toBeGreaterThan(0);
    expect(FakeRecorder.last?.stops).toBe(0);
    expect(trackStop).toHaveBeenCalledOnce();
  });

  it("settles even when the recorder never reports back", async () => {
    vi.useFakeTimers();
    stubMedia();
    FakeRecorder.silent = true;
    const rec = await startAudioRecording();
    const clip = rec.stop();
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS);
    await expect(clip).resolves.toBeInstanceOf(Blob);
    expect(trackStop).toHaveBeenCalledOnce();
  });

  it("lets the mic go when the recorder can't be created", async () => {
    stubMedia();
    FakeRecorder.throwOnCreate = true;
    await expect(startAudioRecording()).rejects.toThrow("NotSupportedError");
    expect(trackStop).toHaveBeenCalledOnce();
  });
});
