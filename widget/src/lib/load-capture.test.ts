import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_GLOBAL, captureUrl, loadCapture, siblingScriptLoader } from "./load-capture.ts";

const injected = () => Array.from(document.head.querySelectorAll("script"));
const published = window as unknown as Record<string, unknown>;

afterEach(() => {
  document.head.innerHTML = "";
  delete published[CAPTURE_GLOBAL];
});

describe("captureUrl", () => {
  it("sits beside the widget.js that loaded us, query and all dropped", () => {
    expect(captureUrl("https://app.brainbox.sh/widget.js?v=3")).toBe(
      "https://app.brainbox.sh/widget-capture.js",
    );
    expect(captureUrl("https://cdn.test/brainbox/1.2/widget.js")).toBe(
      "https://cdn.test/brainbox/1.2/widget-capture.js",
    );
  });
});

describe("loadCapture", () => {
  it("injects the script once and resolves with what it publishes", async () => {
    const first = loadCapture("https://cdn.test/widget.js");
    const second = loadCapture("https://cdn.test/widget.js");
    expect(injected()).toHaveLength(1);
    expect(injected()[0]!.src).toBe("https://cdn.test/widget-capture.js");

    const libs = { record: () => undefined, domToCanvas: () => undefined };
    published[CAPTURE_GLOBAL] = libs;
    injected()[0]!.dispatchEvent(new Event("load"));

    await expect(first).resolves.toBe(libs);
    await expect(second).resolves.toBe(libs);
  });

  it("forgets a failed load so the next capture tries again", async () => {
    // a fresh module, so the success above isn't cached
    vi.resetModules();
    const { loadCapture: load } = await import("./load-capture.ts");
    const failed = load("https://cdn.test/widget.js");
    injected()[0]!.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toThrow(/widget-capture\.js/);

    void load("https://cdn.test/widget.js").catch(() => {});
    expect(injected()).toHaveLength(2);
  });
});

describe("siblingScriptLoader", () => {
  it("serves both libraries from the one script beside widget.js", async () => {
    // the embedding tag, which a fresh module reads its own URL from
    const tag = document.createElement("script");
    tag.dataset.project = "pk_test";
    tag.dataset.endpoint = "https://api.test/ingest";
    tag.src = "https://cdn.test/widget.js";
    document.body.appendChild(tag);
    vi.resetModules();
    const { siblingScriptLoader: loader } = await import("./load-capture.ts");
    tag.remove();
    const recorder = loader.recorder();
    const rasteriser = loader.rasteriser();
    expect(injected()).toHaveLength(1);
    expect(injected()[0]!.src).toBe("https://cdn.test/widget-capture.js");

    const libs = { record: () => undefined, domToCanvas: () => undefined };
    published[CAPTURE_GLOBAL] = libs;
    injected()[0]!.dispatchEvent(new Event("load"));
    expect((await recorder).record).toBe(libs.record);
    expect((await rasteriser).domToCanvas).toBe(libs.domToCanvas);
  });

  it("is a CaptureLoader", () => {
    expect(siblingScriptLoader).toEqual({
      recorder: expect.any(Function),
      rasteriser: expect.any(Function),
    });
  });
});
