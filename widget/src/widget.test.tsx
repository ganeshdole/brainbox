import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Transport } from "@brainbox/core";
import { BrainboxProvider } from "@brainbox/react";
import { BrainboxWidget } from "./widget.tsx";
import { useBrainboxWidget } from "./use-brainbox-widget.ts";

const transport: Transport = { send: async () => ({ id: "r1" }) };
const originalConsoleError = console.error;

/** What the widget put on the page, read through its shadow root. */
const shadow = () => document.getElementById("brainbox-widget")?.shadowRoot ?? null;
const buttons = () =>
  Array.from(shadow()?.querySelectorAll("button") ?? []).map(
    (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "",
  );

/** A host's own trigger, plus what it sees of the widget's state. */
function HostControls() {
  const { isOpen, open, close } = useBrainboxWidget();
  return (
    <>
      <button onClick={open}>Report a problem</button>
      <button onClick={close}>Never mind</button>
      <output>{isOpen ? "open" : "closed"}</output>
    </>
  );
}
const hostSees = () => container.querySelector("output")?.textContent;
const hostClick = (label: string) =>
  Array.from(container.querySelectorAll("button"))
    .find((b) => b.textContent === label)
    ?.click();

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

describe("BrainboxWidget", () => {
  it("renders into a shadow host on <body> that recordings skip, and removes it on unmount", () => {
    act(() => {
      root.render(
        <StrictMode>
          <BrainboxProvider transport={transport}>
            <BrainboxWidget />
          </BrainboxProvider>
        </StrictMode>,
      );
    });

    const host = document.getElementById("brainbox-widget");
    expect(host?.parentElement).toBe(document.body);
    expect(host?.classList.contains("rr-block")).toBe(true);
    expect(document.querySelectorAll("#brainbox-widget")).toHaveLength(1);
    expect(buttons()).toEqual(["Send feedback"]);

    act(() => root.unmount());
    expect(document.getElementById("brainbox-widget")).toBeNull();
    expect(console.error).toBe(originalConsoleError);
  });

  it("opens from a host button anywhere under the provider, and closes again", () => {
    act(() => {
      root.render(
        <BrainboxProvider transport={transport}>
          <HostControls />
          <BrainboxWidget trigger="manual" />
        </BrainboxProvider>,
      );
    });
    // manual trigger: no launcher of our own
    expect(buttons()).toEqual([]);
    expect(hostSees()).toBe("closed");

    act(() => hostClick("Report a problem"));
    expect(hostSees()).toBe("open");
    expect(buttons()).toContain("Close");
    expect(buttons().some((b) => b.startsWith("Screenshot"))).toBe(true);

    act(() => hostClick("Never mind"));
    expect(hostSees()).toBe("closed");
    expect(buttons()).toEqual([]);
  });

  it("reports open when the user opens it from our launcher", () => {
    act(() => {
      root.render(
        <BrainboxProvider transport={transport}>
          <HostControls />
          <BrainboxWidget />
        </BrainboxProvider>,
      );
    });
    act(() => shadow()?.querySelector<HTMLButtonElement>('[aria-label="Send feedback"]')?.click());
    expect(hostSees()).toBe("open");

    act(() => shadow()?.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click());
    expect(hostSees()).toBe("closed");
    expect(buttons()).toEqual(["Send feedback"]);
  });
});
