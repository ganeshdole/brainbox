import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarkTextInput } from "./MarkShape.tsx";

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

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

describe("MarkTextInput", () => {
  it("takes focus back from the click that placed it, so typing works straight away", async () => {
    act(() => {
      root.render(
        <MarkTextInput
          at={{ x: 10, y: 40, value: "" }}
          color="#f00"
          onChange={() => {}}
          onCommit={() => {}}
          onCancel={() => {}}
        />,
      );
    });
    const input = container.querySelector("input");
    // what the same click's mousedown does right after autoFocus
    input?.blur();
    expect(document.activeElement).not.toBe(input);

    await act(nextFrame);
    expect(document.activeElement).toBe(input);
  });
});
