import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transport } from "@ganeshdole/brainbox-core";
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import { BrainboxWidget } from "./widget.tsx";
import { useBrainboxWidget } from "./use-brainbox-widget.ts";
import { BRAINBOX_HOST_ID, isBrainboxEvent } from "./lib/shadow-host.ts";

// jsdom has no mic. A recording that caught voice opens the composer with
// its textarea already up (and autofocused), the case a focus trap catches.
vi.mock("../../packages/core/src/audio.ts", () => ({
  startAudioRecording: async () => ({
    stream: { getAudioTracks: () => [], getTracks: () => [] },
    stop: async () => new Blob(["voice"]),
  }),
}));

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

  it("starts a screenshot straight from a host's own control, skipping the chooser", () => {
    function HostScreenshot() {
      const { start } = useBrainboxWidget();
      return <button onClick={() => start("screenshot")}>Screenshot it</button>;
    }
    act(() => {
      root.render(
        <BrainboxProvider transport={transport}>
          <HostControls />
          <HostScreenshot />
          <BrainboxWidget trigger="manual" />
        </BrainboxProvider>,
      );
    });

    act(() => hostClick("Screenshot it"));
    expect(hostSees()).toBe("open");
    // The markup toolbar, not the chooser's two options.
    expect(buttons()).toContain("Select");
    expect(buttons()).toContain("Next");
    expect(buttons().some((b) => b.startsWith("Screenshot"))).toBe(false);
  });

  it("keeps its clicks from the host page, so the host's open menus stay open", () => {
    let outsideClicks = 0;
    const closeMenusOnOutsideClick = () => {
      outsideClicks += 1;
    };
    document.addEventListener("mousedown", closeMenusOnOutsideClick);
    try {
      act(() => {
        root.render(
          <BrainboxProvider transport={transport}>
            <HostControls />
            <BrainboxWidget trigger="manual" />
          </BrainboxProvider>,
        );
      });
      act(() => hostClick("Report a problem"));

      const close = shadow()?.querySelector<HTMLButtonElement>('[aria-label="Close"]');
      act(() => {
        close?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true }));
      });
      expect(outsideClicks).toBe(0);

      // The widget's own buttons still work, and the host page still hears its own clicks.
      act(() => close?.click());
      expect(hostSees()).toBe("closed");
      container.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(outsideClicks).toBe(1);
    } finally {
      document.removeEventListener("mousedown", closeMenusOnOutsideClick);
    }
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

  it("gets its keys past a host modal's focus trap (#100)", () => {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    const cancelled: string[] = [];
    // The usual trap: cancel Space, Enter and Tab aimed outside its modal.
    // A careful one also lets other dialogs through; a host can use ours.
    const trap = (exempt: (e: KeyboardEvent) => boolean) => (e: KeyboardEvent) => {
      if (e.target instanceof Node && modal.contains(e.target)) return;
      if (exempt(e)) return;
      if ([" ", "Enter", "Tab"].includes(e.key)) {
        e.preventDefault();
        cancelled.push(e.key);
      }
    };
    const inAnotherDialog = trap(
      (e) => e.target instanceof Element && e.target.closest('[aria-modal="true"]') !== null,
    );
    const viaHelper = trap(isBrainboxEvent);
    try {
      act(() => {
        root.render(
          <BrainboxProvider transport={transport}>
            <HostControls />
            <BrainboxWidget trigger="manual" />
          </BrainboxProvider>,
        );
      });
      const host = document.getElementById(BRAINBOX_HOST_ID);
      expect(host?.getAttribute("aria-modal")).toBeNull();

      act(() => hostClick("Report a problem"));
      expect(host?.getAttribute("role")).toBe("dialog");
      expect(host?.getAttribute("aria-modal")).toBe("true");

      const press = (key: string) => {
        const target = shadow()?.querySelector("button");
        const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true });
        target?.dispatchEvent(ev);
        return ev;
      };
      for (const listener of [inAnotherDialog, viaHelper]) {
        document.addEventListener("keydown", listener, true);
        press(" ");
        press("Enter");
        press("Tab");
        document.removeEventListener("keydown", listener, true);
      }
      expect(cancelled).toEqual([]);

      // The helper still says no to the host's own keys, even after dispatch.
      const outside = new KeyboardEvent("keydown", { key: " ", bubbles: true });
      container.dispatchEvent(outside);
      expect(isBrainboxEvent(outside)).toBe(false);
      expect(isBrainboxEvent(press("x"))).toBe(true);

      act(() => hostClick("Never mind"));
      expect(host?.hasAttribute("role")).toBe(false);
      expect(host?.hasAttribute("aria-modal")).toBe(false);
    } finally {
      modal.remove();
    }
  });

  it("is already a dialog when the composer takes focus after a recording", async () => {
    // jsdom's Blob has no stream(); take the session's uncompressed path.
    vi.stubGlobal("CompressionStream", undefined);
    function HostRecord() {
      const { start } = useBrainboxWidget();
      return <button onClick={() => start("record")}>Record it</button>;
    }
    // What a host's focusin trap would see as focus lands in the widget.
    const seen: (string | null)[] = [];
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.id === BRAINBOX_HOST_ID) {
        seen.push(e.target.getAttribute("aria-modal"));
      }
    };
    document.addEventListener("focusin", onFocusIn, true);
    try {
      act(() => {
        root.render(
          <BrainboxProvider transport={transport}>
            <HostRecord />
            <BrainboxWidget trigger="manual" />
          </BrainboxProvider>,
        );
      });
      act(() => hostClick("Record it"));
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      // Recording: the user works in the host page, so not a dialog.
      expect(document.getElementById(BRAINBOX_HOST_ID)?.hasAttribute("aria-modal")).toBe(false);

      const stop = Array.from(shadow()?.querySelectorAll("button") ?? []).find((b) =>
        b.textContent?.includes("Stop"),
      );
      await act(async () => {
        stop?.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      expect(shadow()?.activeElement?.tagName).toBe("TEXTAREA");
      expect(seen).not.toHaveLength(0);
      expect(seen.every((v) => v === "true")).toBe(true);
    } finally {
      document.removeEventListener("focusin", onFocusIn, true);
      vi.unstubAllGlobals();
    }
  });
});
