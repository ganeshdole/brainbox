import { describe, expect, it } from "vitest";
import { originClass, panelClass, posClass, type Position } from "./position.ts";

const corners: Position[] = ["bottom-right", "bottom-left", "top-right", "top-left"];

describe("posClass", () => {
  it("pins each corner 1.25rem in, plus the safe area on that side", () => {
    expect(posClass("bottom-right")).toBe(
      "bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))]",
    );
    expect(posClass("bottom-left")).toBe(
      "bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-[calc(1.25rem+env(safe-area-inset-left,0px))]",
    );
    expect(posClass("top-right")).toBe(
      "top-[calc(1.25rem+env(safe-area-inset-top,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))]",
    );
    expect(posClass("top-left")).toBe(
      "top-[calc(1.25rem+env(safe-area-inset-top,0px))] left-[calc(1.25rem+env(safe-area-inset-left,0px))]",
    );
  });
});

describe("originClass", () => {
  it("grows a panel out of the corner it is pinned to", () => {
    expect(corners.map(originClass)).toEqual([
      "origin-bottom-right",
      "origin-bottom-left",
      "origin-top-right",
      "origin-top-left",
    ]);
  });
});

describe("panelClass", () => {
  it.each(corners)("pins, enters from and fits the screen at %s", (p) => {
    const cls = panelClass(p).split(" ");
    for (const c of posClass(p).split(" ")) expect(cls).toContain(c);
    expect(cls).toContain(originClass(p));
    expect(cls).toContain("pop-in");
    // never wider or taller than the viewport, scrolling inside instead
    expect(cls).toContain(
      "max-w-[calc(100%-2.5rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))]",
    );
    expect(cls).toContain(
      "max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
    );
    expect(cls).toContain("overflow-y-auto");
  });
});
