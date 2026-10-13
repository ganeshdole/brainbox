import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@ganeshdole/brainbox-core";
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import { BrainboxWidget } from "./widget.tsx";
import { useBrainboxWidget } from "./use-brainbox-widget.ts";

// The screens are a chunk of their own (`ui.tsx`), so a host page that never
// opens the widget never downloads them (#101). Here the chunk is a stand-in
// that records when it is loaded.

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock("./ui.tsx", () => {
  loaded.count += 1;
  return { default: () => <p>the widget UI</p> };
});

const transport: Transport = { send: async () => ({ id: "r1" }) };
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const shown = () => document.getElementById("brainbox-widget")?.shadowRoot?.textContent ?? "";

function HostButtons() {
  const { open, close } = useBrainboxWidget();
  return (
    <>
      <button id="open" onClick={open} />
      <button id="close" onClick={close} />
    </>
  );
}

describe("BrainboxWidget's UI chunk", () => {
  it("is not loaded with trigger=manual until the host first opens the widget", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <BrainboxProvider transport={transport}>
          <HostButtons />
          <BrainboxWidget trigger="manual" />
        </BrainboxProvider>,
      );
    });
    await settle();
    expect(loaded.count).toBe(0);
    expect(shown()).toBe("");

    act(() => document.getElementById("open")?.click());
    await settle();
    expect(loaded.count).toBe(1);
    expect(shown()).toBe("the widget UI");

    // Closing keeps it: the UI owns the draft, and it is already here.
    act(() => document.getElementById("close")?.click());
    await settle();
    expect(shown()).toBe("the widget UI");

    act(() => root.unmount());
    container.remove();
  });
});
