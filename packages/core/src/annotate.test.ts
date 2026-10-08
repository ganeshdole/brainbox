import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnnotations, type Annotations } from "./annotate.ts";
import { FONT_STACK, type Mark } from "./marks.ts";

const box: Mark = { kind: "box", id: "b", color: "#ff4d4f", x: 10, y: 20, width: 100, height: 50 };
const query = () => document.querySelectorAll("[data-brainbox-highlight]");
const shape = () => query()[0]?.firstElementChild;

describe("annotate", () => {
  let marks: Annotations;

  beforeEach(() => {
    vi.useFakeTimers();
    marks = createAnnotations();
  });

  afterEach(() => {
    marks.clear();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("paints into the host document, not the shadow root - that's what puts it in the replay", () => {
    marks.show(box);
    expect(document.body.contains(query()[0] ?? null)).toBe(true);
  });

  it("sits in the page flow without intercepting the pointer", () => {
    marks.show(box);
    const el = query()[0] as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    // absolute, not fixed: the mark scrolls with the content it points at
    expect(el.style.position).toBe("absolute");
    expect(el.style.pointerEvents).toBe("none");
  });

  it("draws a box at its coordinates", () => {
    marks.show(box);
    const rect = shape();
    expect(rect?.tagName).toBe("rect");
    expect(rect?.getAttribute("x")).toBe("10");
    expect(rect?.getAttribute("y")).toBe("20");
    expect(rect?.getAttribute("width")).toBe("100");
    expect(rect?.getAttribute("height")).toBe("50");
    expect(rect?.getAttribute("stroke")).toBe("#ff4d4f");
  });

  it("draws an arrow as a shaft plus a head", () => {
    marks.show({ kind: "arrow", id: "a", color: "#fff", x1: 0, y1: 0, x2: 50, y2: 50 });
    const g = shape();
    expect(g?.tagName).toBe("g");
    expect(g?.querySelector("line")).toBeTruthy();
    expect(g?.querySelector("polygon")).toBeTruthy();
  });

  it("draws a stroke as a path", () => {
    marks.show({
      kind: "pen",
      id: "p",
      color: "#fff",
      points: [{ x: 1, y: 1 }, { x: 9, y: 9 }, { x: 17, y: 1 }],
    });
    const path = shape();
    expect(path?.tagName).toBe("path");
    expect(path?.getAttribute("d")).toContain("Q");
  });

  it("draws text with a halo behind it", () => {
    marks.show({ kind: "text", id: "t", color: "#fff", x: 5, y: 30, text: "broken" });
    const text = shape();
    expect(text?.tagName).toBe("text");
    expect(text?.textContent).toBe("broken");
    expect(text?.getAttribute("paint-order")).toBe("stroke");
  });

  it("names the same font the bake uses, so the mark can't be laid out differently", () => {
    marks.show({ kind: "text", id: "t", color: "#fff", x: 5, y: 30, text: "broken" });
    expect(shape()?.getAttribute("font-family")).toBe(FONT_STACK);
  });

  it("stays put - a mark outlives the moment it was drawn", () => {
    marks.show(box);
    vi.advanceTimersByTime(60_000);
    expect(query()).toHaveLength(1);
  });

  it("anchors to the document so a scroll doesn't leave it pointing at the wrong thing", () => {
    window.scrollX = 40;
    window.scrollY = 300;
    marks.show(box);
    const rect = shape();
    expect(rect?.getAttribute("x")).toBe("50"); // 10 + 40
    expect(rect?.getAttribute("y")).toBe("320"); // 20 + 300
    window.scrollX = 0;
    window.scrollY = 0;
  });

  it("cancels out a positioned body, which would otherwise shift every mark", () => {
    // `position:absolute` resolves against the nearest positioned ancestor, so
    // `body{position:relative}` on the host page makes the body's padding box
    // the origin instead of the document's.
    document.body.style.position = "relative";
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ left: 8, top: 8 } as DOMRect);

    marks.show(box);

    const shifted = shape();
    expect(shifted?.getAttribute("x")).toBe("2"); // 10 - 8
    expect(shifted?.getAttribute("y")).toBe("12"); // 20 - 8

    rect.mockRestore();
    document.body.style.position = "";
  });

  it("leaves coordinates alone on an ordinary unpositioned body", () => {
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ left: 8, top: 8 } as DOMRect);

    marks.show(box);

    // No positioned ancestor - the containing block is the document, so the
    // measurement is not consulted at all.
    expect(shape()?.getAttribute("x")).toBe("10");
    expect(shape()?.getAttribute("y")).toBe("20");

    rect.mockRestore();
  });

  it("undoes the most recent mark only", () => {
    marks.show(box);
    marks.show({ ...box, x: 200 });
    expect(marks.undo()).toBe(true);
    expect(query()).toHaveLength(1);
    expect(marks.count()).toBe(1);
  });

  it("reports undo as a no-op when nothing is on the page", () => {
    expect(marks.undo()).toBe(false);
  });

  it("clear removes every mark on the page", () => {
    marks.show(box);
    marks.show({ ...box, x: 200 });
    expect(marks.count()).toBe(2);

    marks.clear();
    expect(query()).toHaveLength(0);
    expect(marks.count()).toBe(0);
  });

  it("clear with nothing active is a no-op", () => {
    expect(() => marks.clear()).not.toThrow();
  });

  it("keeps each recording's marks apart", () => {
    const other = createAnnotations();
    marks.show(box);
    other.show({ ...box, x: 200 });
    other.clear();
    expect(query()).toHaveLength(1);
    expect(marks.count()).toBe(1);
    expect(other.count()).toBe(0);
  });
});
