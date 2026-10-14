import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Report, Transport } from "@ganeshdole/brainbox-core";
import { BrainboxProvider } from "@ganeshdole/brainbox-react";
import {
  BrainboxWidget,
  mount,
  useBrainboxWidget,
  type ChooserProps,
  type ComposerProps,
  type FeatureComposerProps,
  type LauncherProps,
  type MarkupOverlayProps,
  type RecordOverlayProps,
  type ResultProps,
  type StartMode,
  type WidgetComponents,
  type WidgetHandle,
} from "./index.ts";

// Each step of the flow swapped for a host's own component, through the
// public `components` prop: it gets the documented props, its callbacks move
// the flow on, and the steps around it stay ours.

// jsdom has no mic; a recording still needs one to start.
vi.mock("../../packages/core/src/audio.ts", () => ({
  startAudioRecording: async () => ({
    stream: { getAudioTracks: () => [], getTracks: () => [] },
    stop: async () => new Blob(["voice"]),
  }),
}));

let sent: Report[] = [];
const transport: Transport = {
  send: async (report) => {
    sent.push(report);
    return { id: "r1" };
  },
};

const shadow = () => document.getElementById("brainbox-widget")?.shadowRoot ?? null;
const text = () => shadow()?.textContent ?? "";
const findButton = (label: string) =>
  Array.from(shadow()?.querySelectorAll("button") ?? []).find((b) =>
    (b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "").startsWith(label),
  );
const click = (label: string) =>
  act(async () => {
    const b = findButton(label);
    if (!b) throw new Error(`no "${label}" button in the widget`);
    b.click();
  });
const settle = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
/** Settle until `done()`, for at most two seconds. */
async function until(done: () => boolean) {
  for (let waited = 0; !done() && waited < 2000; waited += 20) await settle(20);
}
const uiReady = () =>
  act(async () => {
    await import("./widget-ui.tsx");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The host's own controls: start a step, and what it sees of open/closed. */
function Host() {
  const { isOpen, open, start } = useBrainboxWidget();
  const go = (mode: StartMode) => () => start(mode);
  return (
    <>
      <button id="open" onClick={open} />
      <button id="screenshot" onClick={go("screenshot")} />
      <button id="record" onClick={go("record")} />
      <button id="feature" onClick={go("feature")} />
      <output>{isOpen ? "open" : "closed"}</output>
    </>
  );
}
const hostClick = (id: string) => act(() => document.getElementById(id)?.click());
const hostSees = () => container.querySelector("output")?.textContent;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sent = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderWidget(components: WidgetComponents, props: { trigger?: "floating" | "manual"; featureRequests?: boolean } = {}) {
  act(() => {
    root.render(
      <BrainboxProvider transport={transport}>
        <Host />
        <BrainboxWidget trigger={props.trigger ?? "manual"} featureRequests={props.featureRequests} components={components} />
      </BrainboxProvider>,
    );
  });
}

describe("components overrides", () => {
  it("Launcher: ours is replaced, and clicking yours opens our chooser", async () => {
    function MyLauncher({ position, onClick }: LauncherProps) {
      return <button onClick={onClick}>my launcher at {position}</button>;
    }
    await renderWidget({ Launcher: MyLauncher }, { trigger: "floating" });
    await uiReady();
    expect(findButton("Send feedback")).toBeUndefined();

    await click("my launcher at bottom-right");
    expect(hostSees()).toBe("open");
    expect(findButton("Screenshot")).toBeDefined();
  });

  it("Chooser: gets what to offer, and its pick goes on into our screens", async () => {
    const seen: ChooserProps[] = [];
    function MyChooser(props: ChooserProps) {
      seen.push(props);
      return props.onFeature ? <button onClick={props.onFeature}>my idea</button> : <p>no ideas</p>;
    }
    await renderWidget({ Chooser: MyChooser });
    hostClick("open");
    await uiReady();
    expect(seen.at(-1)).toMatchObject({ position: "bottom-right", canRecord: true });

    await click("my idea");
    expect(findButton("Send idea")).toBeDefined();
  });

  it("Chooser: is told not to offer feature requests when they are off", async () => {
    function MyChooser(props: ChooserProps) {
      return props.onFeature ? <button onClick={props.onFeature}>my idea</button> : <p>no ideas</p>;
    }
    await renderWidget({ Chooser: MyChooser }, { featureRequests: false });
    hostClick("open");
    await uiReady();
    expect(text()).toContain("no ideas");
  });

  it("MarkupOverlay: gets the screenshot's progress, and its marks lead to our composer", async () => {
    const seen: MarkupOverlayProps[] = [];
    function MyMarkup(props: MarkupOverlayProps) {
      seen.push(props);
      return <button onClick={() => props.onDone([])}>my next</button>;
    }
    await renderWidget({ MarkupOverlay: MyMarkup });
    hostClick("screenshot");
    await uiReady();
    // the shot started rasterising as the step opened
    expect(seen.some((p) => p.capturePending)).toBe(true);

    await click("my next");
    expect(findButton("Send")).toBeDefined();
    expect(findButton("Record a voice note")).toBeDefined();
  });

  it("RecordOverlay: gets the recording, and stopping it leads to our composer", async () => {
    // jsdom's Blob has no stream(); take the session's uncompressed path.
    vi.stubGlobal("CompressionStream", undefined);
    const seen: RecordOverlayProps[] = [];
    function MyRecorder(props: RecordOverlayProps) {
      seen.push(props);
      return <button onClick={props.onStop}>my stop</button>;
    }
    await renderWidget({ RecordOverlay: MyRecorder });
    hostClick("record");
    await uiReady();
    expect(findButton("Use the page")).toBeUndefined();
    const last = seen.at(-1);
    expect(last?.annotations.count()).toBe(0);
    expect(typeof last?.micActive()).toBe("boolean");

    await click("my stop");
    await settle(300);
    expect(findButton("Send")).toBeDefined();
  });

  it("Composer: ours is replaced after our markup, and what it submits is sent", async () => {
    function MyComposer({ onSubmit, captureFailed, capturePending }: ComposerProps) {
      return (
        <div>
          <p>my composer {captureFailed || capturePending ? "without" : "with"} a shot</p>
          <button onClick={() => onSubmit("from my composer", null)}>my send</button>
        </div>
      );
    }
    // A slot left undefined falls back to ours.
    await renderWidget({ Composer: MyComposer, Result: undefined });
    hostClick("screenshot");
    await uiReady();
    // our markup still runs the step before
    await click("Next");
    expect(text()).toContain("my composer");

    await click("my send");
    // submit waits for the screenshot in flight, which jsdom fails to take
    await until(() => sent.length > 0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ text: "from my composer" });
    expect(text()).toContain("Thanks! Feedback sent.");
  });

  it("FeatureComposer: what it submits is sent as a feature request", async () => {
    function MyIdea({ onSubmit, position }: FeatureComposerProps) {
      return <button onClick={() => onSubmit("Export to CSV", null, "nice")}>my idea at {position}</button>;
    }
    await renderWidget({ FeatureComposer: MyIdea });
    hostClick("feature");
    await uiReady();

    await click("my idea at bottom-right");
    await settle();
    expect(sent[0]).toMatchObject({ kind: "feature", importance: "nice", text: "Export to CSV" });
    expect(text()).toContain("Thanks! Your idea was sent.");
  });

  it("Result: shows sending, then the sent report, and closing it closes the widget", async () => {
    const kinds: ResultProps["kind"][] = [];
    function MyResult({ kind, id, thanks, onClose }: ResultProps) {
      kinds.push(kind);
      return kind === "success" ? (
        <button onClick={onClose}>
          my result {id}: {thanks}
        </button>
      ) : (
        <p>my {kind}</p>
      );
    }
    await renderWidget({ Result: MyResult });
    hostClick("feature");
    await uiReady();
    act(() => typeInto(shadow()!.querySelector("textarea")!, "Keyboard shortcuts"));
    await click("Send idea");
    await settle();

    expect(kinds).toContain("loading");
    expect(text()).toContain("my result r1: Thanks! Your idea was sent.");
    await click("my result");
    expect(hostSees()).toBe("closed");
  });
});

describe("mount() with components", () => {
  let widget: WidgetHandle | null = null;
  afterEach(() => {
    act(() => widget?.destroy());
    widget = null;
  });

  it("passes them to the widget it mounts", async () => {
    function MyComposer({ onCancel }: ComposerProps) {
      return <button onClick={onCancel}>my mounted composer</button>;
    }
    act(() => {
      widget = mount({ transport, trigger: "manual", components: { Composer: MyComposer } });
    });
    act(() => widget?.start("screenshot"));
    await uiReady();
    await click("Next");
    expect(findButton("my mounted composer")).toBeDefined();

    await click("my mounted composer");
    expect(findButton("my mounted composer")).toBeUndefined();
  });
});
