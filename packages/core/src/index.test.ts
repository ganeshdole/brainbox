import { describe, expect, it, vi } from "vitest";

// Importing the package must not load the heavy libraries: they arrive with
// the first capture, through the loader.
vi.mock("rrweb", () => {
  throw new Error("rrweb was imported eagerly");
});
vi.mock("modern-screenshot", () => {
  throw new Error("modern-screenshot was imported eagerly");
});

describe("importing @ganeshdole/brainbox-core", () => {
  it("does nothing: no console patch, no listeners, no DOM, no heavy libraries", async () => {
    const consoleError = console.error;
    const listen = vi.spyOn(window, "addEventListener");
    const before = document.documentElement.outerHTML;

    const core = await import("./index.ts");

    expect(console.error).toBe(consoleError);
    expect(listen).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).toBe(before);
    // and the building blocks are there to use
    for (const name of [
      "createBrainbox",
      "captureViewport",
      "bakeMarks",
      "startSessionRecording",
      "createAnnotations",
      "captureMetadata",
      "captureErrors",
      "cssPath",
      "elementAt",
      "defaultCaptureLoader",
      "preloadCapture",
    ]) {
      expect(core).toHaveProperty(name);
    }
    listen.mockRestore();
  });
});
