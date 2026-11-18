import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mark } from "@ganeshdole/brainbox-core";
import { MarkupOverlay } from "./MarkupOverlay.tsx";

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

/** Arm the text tool, click the surface and type into the box that opens. */
function typeNote(text: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
  });
  const surface = container.firstElementChild;
  act(() => {
    surface?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 60 }),
    );
  });
  const input = container.querySelector("input");
  if (!input) throw new Error("text box did not open");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** A pointer event as a given pointer: jsdom has no PointerEvent, and React
 *  reads these fields off whatever event arrives. */
const pointerAs = (
  target: Element,
  type: string,
  p: { id: number; primary: boolean; kind: string },
  x: number,
  y: number,
) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(e, "pointerId", { value: p.id });
    Object.defineProperty(e, "isPrimary", { value: p.primary });
    Object.defineProperty(e, "pointerType", { value: p.kind });
    target.dispatchEvent(e);
  });

const next = () =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Next");

describe("MarkupOverlay", () => {
  it("keeps a note that's still being typed when the user presses Next", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    act(() => {
      root.render(<MarkupOverlay onDone={onDone} onCancel={() => {}} />);
    });

    typeNote("this is broken");
    act(() => next()?.click());

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: "text", text: "this is broken", x: 40, y: 60 }),
    ]);
  });

  it("drops an empty text box rather than sending a blank mark", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    act(() => {
      root.render(<MarkupOverlay onDone={onDone} onCancel={() => {}} />);
    });

    typeNote("   ");
    act(() => next()?.click());

    expect(onDone).toHaveBeenCalledWith([]);
  });

  it("keeps a stroke with the finger that began it when a second one lands", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    act(() => {
      root.render(<MarkupOverlay onDone={onDone} onCancel={() => {}} />);
    });
    const surface = container.firstElementChild!;
    const touch = (type: string, id: number, primary: boolean, x: number, y: number) =>
      pointerAs(surface, type, { id, primary, kind: "touch" }, x, y);

    // the box tool is armed by default
    touch("pointerdown", 1, true, 10, 10);
    touch("pointerdown", 2, false, 300, 300); // a second finger, or a palm
    touch("pointermove", 2, false, 400, 400);
    touch("pointermove", 1, true, 100, 80);
    touch("pointerup", 2, false, 400, 400); // lifting it doesn't end the stroke
    touch("pointermove", 1, true, 110, 90);
    touch("pointerup", 1, true, 110, 90);
    act(() => next()?.click());

    expect(onDone.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: "box", x: 10, y: 10, width: 100, height: 80 }),
    ]);
  });

  it("keeps a pen stroke when a palm comes down beside it", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    act(() => {
      root.render(<MarkupOverlay onDone={onDone} onCancel={() => {}} />);
    });
    const surface = container.firstElementChild!;
    const pen = { id: 7, primary: true, kind: "pen" };
    // the first touch is the primary *touch*, while the pen is still down
    const palm = { id: 8, primary: true, kind: "touch" };

    pointerAs(surface, "pointerdown", pen, 20, 30);
    pointerAs(surface, "pointerdown", palm, 250, 400);
    pointerAs(surface, "pointermove", palm, 260, 420);
    pointerAs(surface, "pointermove", pen, 120, 90);
    pointerAs(surface, "pointerup", palm, 260, 420);
    pointerAs(surface, "pointerup", pen, 120, 90);
    act(() => next()?.click());

    expect(onDone.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: "box", x: 20, y: 30, width: 100, height: 60 }),
    ]);
  });

  it("lets a new stroke start when the last one's pointerup never arrived", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    act(() => {
      root.render(<MarkupOverlay onDone={onDone} onCancel={() => {}} />);
    });
    const surface = container.firstElementChild!;

    pointerAs(surface, "pointerdown", { id: 1, primary: true, kind: "touch" }, 5, 5);
    // released off-screen, uncaptured: no pointerup. The next touch is primary.
    const fresh = { id: 2, primary: true, kind: "touch" };
    pointerAs(surface, "pointerdown", fresh, 30, 40);
    pointerAs(surface, "pointermove", fresh, 90, 100);
    pointerAs(surface, "pointerup", fresh, 90, 100);
    act(() => next()?.click());

    expect(onDone.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ kind: "box", x: 30, y: 40, width: 60, height: 60 }),
    ]);
  });
});
