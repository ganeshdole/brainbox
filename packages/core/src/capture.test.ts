import { describe, expect, it } from "vitest";
import {
  captureScale,
  keepForViewport,
  overBudget,
  pickScreenshot,
  SCREENSHOT_BUDGET_BYTES,
  unreadableSheetImports,
} from "./capture.ts";

const VW = 1000;
const VH = 800;

/** Build a DOMRect-shaped box from its top-left corner and size. */
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("keepForViewport", () => {
  it("keeps a box fully inside the viewport", () => {
    expect(keepForViewport(box(10, 10, 100, 100), VW, VH)).toBe(true);
  });

  it("drops a box below the fold", () => {
    expect(keepForViewport(box(0, 1200, 500, 300), VW, VH)).toBe(false);
  });

  it("drops a box scrolled above the viewport", () => {
    expect(keepForViewport(box(0, -900, 500, 300), VW, VH)).toBe(false);
  });

  it("drops boxes off either side", () => {
    expect(keepForViewport(box(-600, 10, 500, 100), VW, VH)).toBe(false);
    expect(keepForViewport(box(1400, 10, 500, 100), VW, VH)).toBe(false);
  });

  it("keeps a box straddling the fold - the visible half still crops in", () => {
    expect(keepForViewport(box(0, 700, 500, 400), VW, VH)).toBe(true);
    expect(keepForViewport(box(0, -100, 500, 400), VW, VH)).toBe(true);
  });

  it("keeps a box taller than the viewport that spans it entirely", () => {
    expect(keepForViewport(box(0, -500, 500, 3000), VW, VH)).toBe(true);
  });

  it("keeps a zero-size box so its children are judged on their own", () => {
    // Wrappers that collapse to nothing still parent visible content.
    expect(keepForViewport(box(0, 5000, 0, 0), VW, VH)).toBe(true);
  });

  it("drops a box resting exactly on the far edge", () => {
    // bottom === 0 and top === vh are both fully outside.
    expect(keepForViewport(box(0, -300, 500, 300), VW, VH)).toBe(false);
    expect(keepForViewport(box(0, VH, 500, 300), VW, VH)).toBe(false);
  });

  it("keeps a box overlapping the edge by a single pixel", () => {
    expect(keepForViewport(box(0, -299, 500, 300), VW, VH)).toBe(true);
    expect(keepForViewport(box(0, VH - 1, 500, 300), VW, VH)).toBe(true);
  });
});

describe("pickScreenshot", () => {
  const plain = new Blob(["plain"]);
  const baked = new Blob(["baked"]);

  it("waits for the bake instead of sending the un-marked shot already in state", async () => {
    // The regression this exists for: leaving the markup step leaves the plain
    // capture in state and the baked one still in flight. Sending the settled
    // blob there throws away every mark the user drew.
    let resolve: (b: Blob) => void = () => undefined;
    const pending = new Promise<Blob>((r) => (resolve = r));
    const picked = pickScreenshot(pending, plain);
    resolve(baked);
    expect(await picked).toBe(baked);
  });

  it("falls back to the settled shot when the promise fails", async () => {
    expect(await pickScreenshot(Promise.reject(new Error("nope")), plain)).toBe(plain);
  });

  it("falls back to the settled shot for a flow that never had a promise", async () => {
    // A recording's last-frame thumbnail lands straight in state.
    expect(await pickScreenshot(null, plain)).toBe(plain);
  });

  it("is null when there is no shot at all", async () => {
    expect(await pickScreenshot(null, null)).toBeNull();
    expect(await pickScreenshot(Promise.reject(new Error("nope")), null)).toBeNull();
  });

  it("resolves to the promise's blob even with nothing settled yet", async () => {
    expect(await pickScreenshot(Promise.resolve(baked), null)).toBe(baked);
  });
});

describe("unreadableSheetImports", () => {
  const readable = (href: string | null) => ({ href, cssRules: [] });
  const crossOrigin = (href: string) => ({
    href,
    get cssRules(): unknown {
      throw new DOMException("Cannot access rules", "SecurityError");
    },
  });

  it("re-declares a cross-origin sheet the page can't read as an import", () => {
    const href = "https://fonts.googleapis.com/css2?family=Inter&display=swap";
    expect(unreadableSheetImports([crossOrigin(href)])).toBe(`@import url("${href}");`);
  });

  it("leaves readable sheets and inline <style> to modern-screenshot", () => {
    expect(unreadableSheetImports([readable("https://host.test/app.css"), readable(null)])).toBe("");
  });

  it("imports every unreadable sheet, one rule each", () => {
    const css = unreadableSheetImports([
      crossOrigin("https://a.test/a.css"),
      readable("https://host.test/app.css"),
      crossOrigin("https://b.test/b.css"),
    ]);
    expect(css).toBe('@import url("https://a.test/a.css");\n@import url("https://b.test/b.css");');
  });
});

describe("captureScale", () => {
  it("matches a Retina display", () => {
    expect(captureScale(2)).toBe(2);
    expect(captureScale(1.5)).toBe(1.5);
  });

  it("caps very dense displays at 2x", () => {
    expect(captureScale(3)).toBe(2);
  });

  it("never drops below 1x, even zoomed out", () => {
    expect(captureScale(1)).toBe(1);
    expect(captureScale(0.5)).toBe(1);
  });

  it("falls back to 1x for a missing ratio", () => {
    expect(captureScale(Number.NaN)).toBe(1);
  });
});

describe("overBudget", () => {
  const over = SCREENSHOT_BUDGET_BYTES + 1;

  it("keeps a sharp shot that fits the upload cap", () => {
    expect(overBudget(SCREENSHOT_BUDGET_BYTES, 2000, 1000)).toBe(false);
  });

  it("redoes a sharp shot that would be rejected", () => {
    expect(overBudget(over, 2000, 1000)).toBe(true);
  });

  it("leaves a 1x shot alone - there is no resolution left to give up", () => {
    expect(overBudget(over, 1000, 1000)).toBe(false);
  });
});
