import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_GLOBAL, captureUrl, loadCapture } from "./load-capture.ts";

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
