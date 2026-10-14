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
});
