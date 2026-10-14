import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotations, Importance, Mark } from "@ganeshdole/brainbox-core";
import {
  BrainboxShadow,
  Chooser,
  Composer,
  createShadowHost,
  FeatureComposer,
  Launcher,
  RecordOverlay,
  Result,
  useMultibandVolume,
  widgetCss,
} from "./ui.ts";
import { BRAINBOX_HOST_ID, BrainboxWidget, isBrainboxEvent } from "./index.ts";
import { BrainboxProvider } from "@ganeshdole/brainbox-react";

// The screens through the public `./ui` entry, each rendered on its own with
// nothing but its props: no widget, no store, no Brainbox instance.

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
  vi.useRealTimers();
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    (b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "").startsWith(label),
  );
function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const pointer = (type: string, target: Element, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  });

describe("BrainboxShadow", () => {
  const host = () => document.querySelector<HTMLElement>("[data-brainbox-host]");

  it("renders a screen into a styled, themed shadow root on <body>, and takes it away again", () => {
    render(
      <BrainboxShadow theme="light">
        <Launcher position="bottom-left" onClick={() => {}} />
      </BrainboxShadow>,
    );
    const shadow = host()?.shadowRoot;
    expect(host()?.parentElement).toBe(document.body);
    // (vitest leaves `?inline` CSS empty; shadow-css.test.ts covers its content)
    expect(shadow?.querySelector("style")?.textContent).toBe(widgetCss);
    const rootEl = shadow?.querySelector(".bb-root");
    expect(rootEl?.classList.contains("dark")).toBe(false);
    // the hook a page themes it through
    expect(rootEl?.getAttribute("part")).toBe("root");
    expect(shadow?.querySelector("button")?.getAttribute("aria-label")).toBe("Send feedback");
    // nothing landed in the host's own tree
    expect(container.innerHTML).toBe("");

    render(null);
    expect(host()).toBeNull();
  });

  it("sits beside the widget without taking its id, and its events still count as Brainbox's", async () => {
    render(
      <BrainboxProvider transport={{ send: async () => ({ id: "r1" }) }}>
        <BrainboxWidget />
        <BrainboxShadow>
          <Launcher position="top-left" onClick={() => {}} />
        </BrainboxShadow>
      </BrainboxProvider>,
    );
    const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-brainbox-host]"));
    expect(hosts).toHaveLength(2);
    // One element with the widget's id: getElementById(BRAINBOX_HOST_ID) is the widget.
    expect(document.querySelectorAll(`#${BRAINBOX_HOST_ID}`)).toHaveLength(1);
    const standalone = hosts.find((h) => h.id !== BRAINBOX_HOST_ID);
    expect(standalone?.id).toBe("");

    // A host's focus trap lets keys typed in the standalone surface through.
    const button = standalone?.shadowRoot?.querySelector("button");
    let seen: boolean | null = null;
    const onKey = (e: KeyboardEvent) => {
      seen = isBrainboxEvent(e);
    };
    document.addEventListener("keydown", onKey);
    button?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true }));
    document.removeEventListener("keydown", onKey);
    expect(seen).toBe(true);
    // let the widget's lazy UI land before the next test unmounts it
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  });

  it("uses the host it is given, so a draft can exclude it before anything renders", () => {
    const given = createShadowHost();
    render(
      <BrainboxShadow host={given}>
        <p>inside</p>
      </BrainboxShadow>,
    );
    expect(host()).toBe(given.element);
    expect(given.container.classList.contains("dark")).toBe(true);
    expect(given.container.textContent).toContain("inside");
  });
});

describe("the exported screens", () => {
  it("Launcher opens through its callback", () => {
    const onClick = vi.fn();
    render(<Launcher position="top-right" onClick={onClick} />);
    act(() => button("Send feedback")?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Chooser offers what its props allow and reports the pick", () => {
    const onScreenshot = vi.fn();
    const onFeature = vi.fn();
    const props = {
      position: "bottom-right" as const,
      onScreenshot,
      onRecord: () => {},
      onCancel: () => {},
    };
    render(<Chooser {...props} canRecord={false} />);
    expect(button("Record")).toBeUndefined();
    expect(button("Suggest a feature")).toBeUndefined();

    render(<Chooser {...props} canRecord onFeature={onFeature} />);
    expect(button("Record")).toBeDefined();
    act(() => button("Screenshot")?.click());
    act(() => button("Suggest a feature")?.click());
    expect(onScreenshot).toHaveBeenCalledTimes(1);
    expect(onFeature).toHaveBeenCalledTimes(1);
  });

  it("Composer hands back what the user typed", () => {
    const onSubmit = vi.fn<(text: string, audio: Blob | null) => void>();
    render(
      <Composer
        screenshotUrl="blob:shot"
        position="bottom-right"
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:shot");
    act(() => button("Prefer to type?")?.click());
    act(() => typeInto(container.querySelector("textarea")!, "The total is wrong"));
    act(() => button("Send")?.click());
    expect(onSubmit).toHaveBeenCalledWith("The total is wrong", null);
  });

  it("Composer skips the mic when the recording already caught the user's voice", () => {
    render(
      <Composer sessionReady voiceCaptured position="bottom-right" onCancel={() => {}} onSubmit={() => {}} />,
    );
    expect(button("Record a voice note")).toBeUndefined();
    expect(container.textContent).toContain("Session recorded with voice");
  });

  it("FeatureComposer waits for words, and sends them with how much they matter", () => {
    const onSubmit = vi.fn<(text: string, audio: Blob | null, importance: Importance | undefined) => void>();
    const onScreenshot = vi.fn();
    render(
      <FeatureComposer
        position="bottom-right"
        onScreenshot={onScreenshot}
        onRemoveScreenshot={() => {}}
        onCancel={() => {}}
        onSubmit={onSubmit}
      />,
    );
    expect(button("Send idea")?.disabled).toBe(true);
    act(() => typeInto(container.querySelector("textarea")!, "Dark mode"));
    act(() => button("Blocking me")?.click());
    act(() => button("Add a screenshot")?.click());
    act(() => button("Send idea")?.click());
    expect(onScreenshot).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Dark mode", null, "critical");
  });

  it("Result says thanks and closes itself; an error waits to be dismissed", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Result kind="success" id="abcdef123456" thanks="Got it" position="bottom-right" onClose={onClose} />);
    expect(container.textContent).toContain("Got it");
    expect(container.textContent).toContain("#abcdef12");
    act(() => vi.advanceTimersByTime(3000));
    expect(onClose).toHaveBeenCalledTimes(1);

    render(<Result kind="error" message="Offline" position="bottom-right" onClose={onClose} />);
    act(() => vi.advanceTimersByTime(10000));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Offline");
  });

  it("RecordOverlay draws onto the recording's annotations and stops through its callback", () => {
    const shown: Mark[] = [];
    const annotations: Annotations = {
      show: (m) => void shown.push(m),
      undo: () => shown.pop() !== undefined,
      count: () => shown.length,
      inView: () => shown,
      clear: () => void shown.splice(0),
    };
    const onStop = vi.fn();
    render(
      <RecordOverlay
        annotations={annotations}
        onStop={onStop}
        micActive={() => false}
        onMuteChange={() => {}}
      />,
    );
    expect(button("Undo last mark")?.disabled).toBe(true);

    act(() => button("Box")?.click());
    const surface = container.querySelector(".cursor-crosshair")!;
    pointer("pointerdown", surface, 10, 20);
    pointer("pointermove", surface, 110, 80);
    pointer("pointerup", surface, 110, 80);
    expect(shown).toEqual([
      expect.objectContaining({ kind: "box", x: 10, y: 20, width: 100, height: 60 }),
    ]);
    expect(button("Undo last mark")?.disabled).toBe(false);

    act(() => button("Stop")?.click());
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe("useMultibandVolume", () => {
  it("stays flat, one level per band, with no stream", () => {
    let levels: number[] = [];
    function Meter() {
      levels = useMultibandVolume(null, { bands: 8 });
      return null;
    }
    render(<Meter />);
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
