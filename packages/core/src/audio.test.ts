import { afterEach, describe, expect, it, vi } from "vitest";
import { startAudioRecording } from "./audio.ts";

// jsdom has neither a mic nor MediaRecorder; both are stood in for here.
const trackStop = vi.fn();
const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;

class FakeRecorder {
  static isTypeSupported = () => true;
  static throwOnCreate = false;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stops = 0;
  constructor() {
    if (FakeRecorder.throwOnCreate) throw new Error("NotSupportedError");
  }
  start() {}
  stop() {
    this.stops += 1;
    // a real MediaRecorder fires `stop` once, and never again
    if (this.stops > 1) return;
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["voice"]) });
      this.onstop?.();
    });
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

  it("lets the mic go when the recorder can't be created", async () => {
    stubMedia();
    FakeRecorder.throwOnCreate = true;
    await expect(startAudioRecording()).rejects.toThrow("NotSupportedError");
    expect(trackStop).toHaveBeenCalledOnce();
  });
});
