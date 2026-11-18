import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { barHeight } from "../lib/multiband.ts";
import { BarRow } from "./BarVisualizer.tsx";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BarRow", () => {
  it("moves each bar with a composited scale, never its height", () => {
    act(() => root.render(<BarRow levels={[0, 0.5, 1]} dimFrom={2} />));
    const bars = Array.from(container.querySelectorAll<HTMLElement>("span > span"));

    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.style.transform)).toEqual(
      [0, 0.5, 1].map((l) => `scaleY(${barHeight(l) / 100})`),
    );
    for (const b of bars) {
      // full height, with no inline height to re-lay out on every frame
      expect(b.style.height).toBe("");
      expect(b.className).toContain("h-full");
      expect(b.className).toContain("transition-[transform,opacity]");
    }
    // the scrubber still dims from `dimFrom` on
    expect(bars.map((b) => b.style.opacity)).toEqual(["1", "1", "0.25"]);
  });
});
