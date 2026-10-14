import { describe, expect, it, vi } from "vitest";
import type { CaptureLoader } from "./loader.ts";
import {
  micOffsetMs,
  startSessionRecording as startWith,
  type SessionRecordingOptions,
} from "./session.ts";

const stopRecorder = vi.fn();
const record = vi.fn(() => stopRecorder);
/** Hold the rrweb load open to race a Stop against it. */
let recorderGate: Promise<void> = Promise.resolve();
const loader: CaptureLoader = {
  recorder: () =>
    recorderGate.then(() => ({ record: record as unknown as Awaited<ReturnType<CaptureLoader["recorder"]>>["record"] })),
  rasteriser: () => Promise.reject(new Error("not in these tests")),
};
/** Every recording here gets rrweb from the stub above. */
const startSessionRecording = (options: SessionRecordingOptions = {}) =>
  startWith({ loader, ...options });

const startAudio = vi.hoisted(() => vi.fn());

const track = () => ({ enabled: true, stop: vi.fn() });
const tracks = [track()];

vi.mock("./audio.ts", () => ({
  startAudioRecording: () => {
    startAudio();
    return Promise.resolve({
      stream: { getAudioTracks: () => tracks, getTracks: () => tracks },
      stop: () => Promise.resolve(new Blob()),
    });
  },
}));

// jsdom has no Blob.stream(), so send gzipJson down its documented
// no-CompressionStream path rather than reimplementing the browser here.
vi.stubGlobal("CompressionStream", undefined);

/** jsdom's Blob has no text(). */
const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

/** Let the mic promise settle - it's started eagerly inside the constructor. */
const micUp = () => new Promise((r) => setTimeout(r, 0));

describe("micOffsetMs", () => {
  it("returns how long after session start the mic came up", () => {
    expect(micOffsetMs(1_000, 1_350)).toBe(350);
  });

  it("clamps clock skew to zero", () => {
    expect(micOffsetMs(1_000, 990)).toBe(0);
  });

  it("returns null when the mic never started", () => {
    expect(micOffsetMs(1_000, null)).toBeNull();
  });
});

describe("setMicMuted", () => {
  it("starts unmuted - narration is on by default", async () => {
    const rec = startSessionRecording();
    await micUp();
    expect(rec.micActive()).toBe(true);
    expect(tracks[0]?.enabled).toBe(true);
    await rec.stop();
  });

  it("disables the track rather than stopping it, so the audio stays in sync", async () => {
    const rec = startSessionRecording();
    await micUp();

    rec.setMicMuted(true);
    expect(tracks[0]?.enabled).toBe(false);
    // still recording - a stopped track could never resume mid-session
    expect(tracks[0]?.stop).not.toHaveBeenCalled();
    expect(rec.micActive()).toBe(true);

    rec.setMicMuted(false);
    expect(tracks[0]?.enabled).toBe(true);
    await rec.stop();
  });

  it("applies a mute chosen while the permission prompt was still up", async () => {
    const rec = startSessionRecording();
    rec.setMicMuted(true); // before the mic resolves
    await micUp();
    expect(tracks[0]?.enabled).toBe(false);
    await rec.stop();
  });
});

describe("loading rrweb", () => {
  it("starts the recorder once rrweb arrives and stops it on Stop", async () => {
    record.mockClear();
    stopRecorder.mockClear();
    const rec = startSessionRecording();
    await micUp();
    expect(record).toHaveBeenCalledOnce();
    await rec.stop();
    expect(stopRecorder).toHaveBeenCalledOnce();
  });

  it("never starts the recorder when Stop beats the load", async () => {
    record.mockClear();
    let release = () => {};
    recorderGate = new Promise((r) => (release = r));
    const rec = startSessionRecording();
    const stopped = rec.stop();
    release();
    await stopped;
    expect(record).not.toHaveBeenCalled();
    recorderGate = Promise.resolve();
  });

  it("starts the mic and the clock only once rrweb is recording", async () => {
    let release = () => {};
    recorderGate = new Promise((r) => (release = r));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const rec = startSessionRecording();
    await micUp();
    // the capture chunk is still loading - nothing is being recorded yet
    expect(rec.micActive()).toBe(false);

    now.mockReturnValue(5_000);
    release();
    await micUp();
    expect(rec.micActive()).toBe(true);

    const { session } = await rec.stop();
    const payload = JSON.parse(await readText(session)) as { audioOffsetMs?: number };
    // measured from rrweb's start, not from the click that began loading it
    expect(payload.audioOffsetMs).toBe(0);
    now.mockRestore();
    recorderGate = Promise.resolve();
  });

  it("starts the duration cap with the recorder", async () => {
    vi.useFakeTimers();
    let release = () => {};
    recorderGate = new Promise((r) => (release = r));
    const onAutoStop = vi.fn();
    const rec = startSessionRecording({ onAutoStop, maxMs: 1_000 });
    await vi.advanceTimersByTimeAsync(900);
    release();
    await vi.advanceTimersByTimeAsync(900);
    expect(onAutoStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(onAutoStop).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await rec.stop();
    recorderGate = Promise.resolve();
  });
});

/** What the n-th `record()` call was given (the mock is declared without parameters). */
const recordOptions = (n: number) => (record.mock.calls as unknown[][])[n]?.[0];

describe("privacy", () => {
  it("masks no more text than .rr-mask unless asked", async () => {
    record.mockClear();
    const rec = startSessionRecording();
    await micUp();
    await rec.stop();
    expect(recordOptions(0)).toMatchObject({ maskTextSelector: undefined });
  });

  it("passes the text masking through to rrweb", async () => {
    record.mockClear();
    for (const privacy of [{ maskTextSelector: ".phi" }, { maskAllText: true, maskTextSelector: ".phi" }]) {
      const rec = startSessionRecording({ privacy });
      await micUp();
      await rec.stop();
    }
    expect(recordOptions(0)).toMatchObject({ maskTextSelector: ".phi", maskAllInputs: true });
    expect(recordOptions(1)).toMatchObject({ maskTextSelector: "*" });
  });
});

describe("options", () => {
  it("records without the mic when audio is off", async () => {
    startAudio.mockClear();
    const rec = startSessionRecording({ audio: false });
    await micUp();
    expect(startAudio).not.toHaveBeenCalled();
    expect(rec.micActive()).toBe(false);
    const { audio, session } = await rec.stop();
    expect(audio).toBeNull();
    expect(JSON.parse(await readText(session))).not.toHaveProperty("audioOffsetMs");
  });

  it("asks for the mic by default", async () => {
    startAudio.mockClear();
    const rec = startSessionRecording();
    await micUp();
    expect(startAudio).toHaveBeenCalledOnce();
    await rec.stop();
  });

  it("lays the host's rrweb options over the defaults", async () => {
    record.mockClear();
    const sampling = { mousemove: false };
    const rec = startSessionRecording({ rrweb: { recordCanvas: true, sampling } });
    await micUp();
    await rec.stop();
    expect(recordOptions(0)).toMatchObject({ recordCanvas: true, sampling, collectFonts: false });
  });

  it("keeps input masking and the rr- classes whatever the host passes", async () => {
    record.mockClear();
    // what a plain-JS host could hand over despite the type
    const loosened = {
      maskAllInputs: false,
      maskInputFn: (text: string) => text,
      blockClass: "nothing",
      maskTextSelector: ".only-this",
    } as unknown as SessionRecordingOptions["rrweb"];
    const rec = startSessionRecording({ rrweb: loosened, privacy: { maskAllText: true } });
    await micUp();
    await rec.stop();
    expect(recordOptions(0)).toMatchObject({
      maskAllInputs: true,
      maskInputFn: undefined,
      blockClass: "rr-block",
      maskTextSelector: "*",
    });
    expect((recordOptions(0) as { emit?: unknown }).emit).toBeTypeOf("function");
  });
});
