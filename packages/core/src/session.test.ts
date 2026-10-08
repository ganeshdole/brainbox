import { describe, expect, it, vi } from "vitest";
import { micOffsetMs, startSessionRecording } from "./session.ts";

vi.mock("rrweb", () => ({ record: () => () => {} }));

const track = () => ({ enabled: true, stop: vi.fn() });
const tracks = [track()];

vi.mock("./audio.ts", () => ({
  startAudioRecording: () =>
    Promise.resolve({
      stream: { getAudioTracks: () => tracks, getTracks: () => tracks },
      stop: () => Promise.resolve(new Blob()),
    }),
}));

// jsdom has no Blob.stream(), so send gzipJson down its documented
// no-CompressionStream path rather than reimplementing the browser here.
vi.stubGlobal("CompressionStream", undefined);

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
    const rec = startSessionRecording(() => {});
    await micUp();
    expect(rec.micActive()).toBe(true);
    expect(tracks[0]?.enabled).toBe(true);
    await rec.stop();
  });

  it("disables the track rather than stopping it, so the audio stays in sync", async () => {
    const rec = startSessionRecording(() => {});
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
    const rec = startSessionRecording(() => {});
    rec.setMicMuted(true); // before the mic resolves
    await micUp();
    expect(tracks[0]?.enabled).toBe(false);
    await rec.stop();
  });
});
