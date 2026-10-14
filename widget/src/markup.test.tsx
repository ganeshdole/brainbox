import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrainbox,
  type Draft,
  type DraftState,
  type Mark,
  type Report,
} from "@ganeshdole/brainbox-core";
import { BrainboxShadow, createShadowHost, DraftMarkup, MarkupOverlay } from "./markup.ts";

// The markup step as a brick of its own, through the public `./markup` entry:
// over a plain image, over a core `Draft`, and the README's recipe with a real
// instance. No widget, no store, no launcher.

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

const render = (node: React.ReactNode) => act(() => root.render(node));
const findButton = (scope: ParentNode, label: string) =>
  Array.from(scope.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label,
  );
/** Drag out a box with the default tool. */
function drawBox(scope: ParentNode, from: [number, number], to: [number, number]) {
  const surface = scope.querySelector(".cursor-crosshair");
  if (!surface) throw new Error("no drawing surface");
  const fire = (type: string, [x, y]: [number, number]) =>
    act(() => {
      surface.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    });
  fire("pointerdown", from);
  fire("pointermove", to);
  fire("pointerup", to);
}

/** A `Draft` that records what the markup asks of it. */
function fakeDraft() {
  let state: DraftState = {
    screenshotUrl: null,
    screenshotPending: false,
    screenshotFailed: false,
    hasSession: false,
    hasVoice: false,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<DraftState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const draft: Draft = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    captureScreenshot: vi.fn(() => set({ screenshotPending: true })),
    markUp: vi.fn<(marks: Mark[]) => void>(),
    startRecording: () => {
      throw new Error("not part of the markup step");
    },
    submit: async () => ({ id: "x" }),
    cancel: vi.fn(),
  };
  return { draft, set };
}

describe("MarkupOverlay over a plain image", () => {
  it("shows the image, and hands back what was drawn on it", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    render(
      <MarkupOverlay screenshotUrl="blob:design" hint="Circle what to change" onDone={onDone} onCancel={() => {}} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:design");
    expect(container.textContent).toContain("Circle what to change");

    drawBox(container, [20, 30], [220, 130]);
    act(() => findButton(container, "Next")?.click());
    expect(onDone).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "box", x: 20, y: 30, width: 200, height: 100 }),
    ]);
  });

  it("undoes the last mark, and Escape cancels", () => {
    const onDone = vi.fn<(marks: Mark[]) => void>();
    const onCancel = vi.fn();
    render(<MarkupOverlay screenshotUrl="blob:design" onDone={onDone} onCancel={onCancel} />);
    drawBox(container, [0, 0], [50, 50]);
    expect(findButton(container, "Undo (⌘Z)")?.disabled).toBe(false);
    act(() => findButton(container, "Undo (⌘Z)")?.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => findButton(container, "Next")?.click());
    expect(onDone).toHaveBeenCalledWith([]);
  });
});

describe("DraftMarkup", () => {
  it("starts the draft's screenshot once, even under StrictMode, and shows it when it lands", () => {
    const { draft, set } = fakeDraft();
    render(
      <StrictMode>
        <DraftMarkup draft={draft} onDone={() => {}} onCancel={() => {}} />
      </StrictMode>,
    );
    expect(draft.captureScreenshot).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Freezing the page");

    act(() => set({ screenshotPending: false, screenshotUrl: "blob:frozen" }));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:frozen");
  });

  it("gives the marks to the draft, then to onDone", () => {
    const { draft } = fakeDraft();
    const onDone = vi.fn<(marks: Mark[]) => void>();
    render(<DraftMarkup draft={draft} onDone={onDone} onCancel={() => {}} />);
    drawBox(container, [10, 10], [90, 60]);
    act(() => findButton(container, "Next")?.click());

    const box = expect.objectContaining({ kind: "box", width: 80, height: 50 });
    expect(draft.markUp).toHaveBeenCalledWith([box]);
    expect(onDone).toHaveBeenCalledWith([box]);
  });

  it("leaves the screenshot alone with capture={false}, and the draft alone on cancel", () => {
    const { draft } = fakeDraft();
    const onCancel = vi.fn();
    render(<DraftMarkup draft={draft} capture={false} onDone={() => {}} onCancel={onCancel} />);
    act(() => findButton(container, "Cancel (Esc)")?.click());
    expect(draft.captureScreenshot).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(draft.cancel).not.toHaveBeenCalled();
  });

  it("files a report from a real draft in a styled shadow root (the README recipe)", async () => {
    const sent: Report[] = [];
    const brainbox = createBrainbox({
      transport: {
        send: async (report) => {
          sent.push(report);
          return { id: "m1" };
        },
      },
    });
    const host = createShadowHost();
    const draft = brainbox.draft({ exclude: host.element });
    const onDone = vi.fn<(marks: Mark[]) => void>();
    // core names the page element under the marks; jsdom has no hit testing
    document.elementFromPoint = () => document.body;
    try {
      render(
        <BrainboxShadow host={host}>
          <DraftMarkup draft={draft} onDone={onDone} onCancel={() => draft.cancel()} />
        </BrainboxShadow>,
      );
      const shadow = host.element.shadowRoot!;
      expect(host.element.isConnected).toBe(true);
      expect(shadow.querySelector("style")).not.toBeNull();
      expect(draft.getState().screenshotPending).toBe(true);

      drawBox(shadow, [100, 100], [300, 200]);
      act(() => findButton(shadow, "Next")?.click());
      expect(onDone).toHaveBeenCalledTimes(1);

      await act(() => draft.submit({ text: "This chart is empty" }));
      expect(sent).toHaveLength(1);
      // the box became the report's region
      expect(sent[0]).toMatchObject({
        text: "This chart is empty",
        region: { x: 100, y: 100, width: 200, height: 100 },
      });
    } finally {
      brainbox.destroy();
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  });
});
