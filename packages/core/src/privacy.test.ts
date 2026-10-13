import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paintCovers, recordMaskOptions, screenshotCovers, type Cover } from "./privacy.ts";

describe("recordMaskOptions", () => {
  it("adds nothing by default", () => {
    expect(recordMaskOptions()).toEqual({});
    expect(recordMaskOptions({ maskScreenshots: true })).toEqual({});
  });

  it("masks a selector, or everything", () => {
    expect(recordMaskOptions({ maskTextSelector: ".phi" })).toEqual({ maskTextSelector: ".phi" });
    expect(recordMaskOptions({ maskAllText: true, maskTextSelector: ".phi" })).toEqual({
      maskTextSelector: "*",
    });
  });
});

// jsdom does no layout. Every element and every line of text gets a box keyed
// off its `data-at` (or its parent's), so a test can say which ones were covered.
const at = (el: Element | null) => Number(el?.getAttribute("data-at") ?? -1);
const rect = (y: number) => ({ left: 0, top: y, width: 10, height: 5 }) as DOMRect;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rect(at(this));
  });
  let text: Node | null = null;
  vi.spyOn(Range.prototype, "selectNodeContents").mockImplementation((node: Node) => {
    text = node;
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [rect(at(text?.parentElement ?? null))],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** The `data-at` of everything a screenshot would cover. */
const covered = (...args: Parameters<typeof screenshotCovers>) =>
  screenshotCovers(...args)
    .map((c) => c.y)
    .sort((a, b) => a - b);

function page(): HTMLElement {
  document.body.innerHTML = `
    <p data-at="1">Plain text</p>
    <p data-at="2" class="rr-mask">Masked <b data-at="3">nested</b></p>
    <p data-at="4" class="phi">Jane Doe, DOB 1980-01-01</p>
    <div data-at="5" class="rr-block"><span data-at="6">inside a block</span><input data-at="7" /></div>
    <input data-at="8" value="typed" />
    <input data-at="9" type="checkbox" />
    <textarea data-at="10">notes</textarea>
    <div data-at="11" id="widget"><p data-at="12">the widget's own text</p><input data-at="13" /></div>
    <p data-at="14">   </p>
  `;
  const widget = document.getElementById("widget");
  if (!widget) throw new Error("fixture");
  return widget;
}

describe("screenshotCovers", () => {
  it("covers nothing unless screenshots are masked", () => {
    page();
    expect(covered()).toEqual([]);
    expect(covered({ maskAllText: true, maskTextSelector: ".phi" })).toEqual([]);
  });

  it("boxes out blocks and form fields and covers .rr-mask text, leaving the widget alone", () => {
    const widget = page();
    // 5: the block (its contents go with it), 8 and 10: fields with values,
    // 2 and 3: masked text and its descendants'. Not 9, a checkbox.
    expect(covered({ maskScreenshots: true }, widget)).toEqual([2, 3, 5, 8, 10]);
  });

  it("adds the host's own selector, or every line of text", () => {
    const widget = page();
    expect(covered({ maskScreenshots: true, maskTextSelector: ".phi" }, widget)).toEqual([
      2, 3, 4, 5, 8, 10,
    ]);
    expect(covered({ maskScreenshots: true, maskAllText: true }, widget)).toEqual([
      1, 2, 3, 4, 5, 8, 10,
    ]);
  });
});

describe("paintCovers", () => {
  it("fills each cover at the shot's scale", () => {
    const fillRect = vi.fn();
    const ctx = { save: vi.fn(), restore: vi.fn(), fillRect, fillStyle: "" };
    const covers: Cover[] = [{ x: 10, y: 20, width: 30, height: 4 }];
    paintCovers(ctx as unknown as CanvasRenderingContext2D, covers, 2);
    expect(fillRect).toHaveBeenCalledWith(20, 40, 60, 8);
  });
});
