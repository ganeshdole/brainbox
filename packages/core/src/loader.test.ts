import { describe, expect, it, vi } from "vitest";
import { defaultCaptureLoader, preloadCapture, type CaptureLoader } from "./loader.ts";

const record = vi.hoisted(() => vi.fn());
const domToCanvas = vi.hoisted(() => vi.fn());
vi.mock("rrweb", () => ({ record }));
vi.mock("modern-screenshot", () => ({ domToCanvas }));

describe("defaultCaptureLoader", () => {
  it("imports rrweb and modern-screenshot", async () => {
    expect((await defaultCaptureLoader.recorder()).record).toBe(record);
    expect((await defaultCaptureLoader.rasteriser()).domToCanvas).toBe(domToCanvas);
  });
});

describe("preloadCapture", () => {
  it("starts both loads through the loader it is given", () => {
    const loader: CaptureLoader = {
      recorder: vi.fn(() => Promise.reject(new Error("offline"))),
      rasteriser: vi.fn(() => Promise.reject(new Error("offline"))),
    };
    // a failed preload is the capture's to report, not an unhandled rejection
    expect(() => preloadCapture(loader)).not.toThrow();
    expect(loader.recorder).toHaveBeenCalledOnce();
    expect(loader.rasteriser).toHaveBeenCalledOnce();
  });
});
