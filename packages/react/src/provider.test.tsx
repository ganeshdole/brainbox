import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrainbox,
  type Brainbox,
  type CaptureLoader,
  type Report,
  type ReportField,
  type Transport,
} from "@ganeshdole/brainbox-core";
import { BrainboxProvider, useBrainbox } from "./provider.tsx";

const originalConsoleError = console.error;

const sent: Report[] = [];
const transport: Transport = {
  send: async (report) => {
    sent.push(report);
    return { id: "r1" };
  },
};

/** Hands each instance the provider publishes to the test. */
function Probe({ onInstance }: { onInstance: (bb: Brainbox | null) => void }) {
  const bb = useBrainbox();
  useEffect(() => {
    onInstance(bb);
  }, [bb, onInstance]);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sent.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BrainboxProvider", () => {
  it("creates one instance under StrictMode and destroys it on unmount", () => {
    const seen: (Brainbox | null)[] = [];
    act(() => {
      root.render(
        <StrictMode>
          <BrainboxProvider transport={transport}>
            <Probe onInstance={(bb) => seen.push(bb)} />
          </BrainboxProvider>
        </StrictMode>,
      );
    });

    const live = seen.filter((bb): bb is Brainbox => bb !== null);
    expect(live.length).toBeGreaterThan(0);
    // StrictMode mounts, unmounts and mounts again; whatever it did, one
    // instance is alive now: the console hook is installed...
    expect(console.error).not.toBe(originalConsoleError);

    act(() => root.unmount());
    // ...and gone once the provider is.
    expect(console.error).toBe(originalConsoleError);
  });

  it("is null before the effect runs, and on a tree rendered without a provider", () => {
    const seen: (Brainbox | null)[] = [];
    act(() => {
      root.render(<Probe onInstance={(bb) => seen.push(bb)} />);
    });
    expect(seen).toEqual([null]);
  });

  it("passes identity to the instance and follows changes to it", async () => {
    let bb: Brainbox | null = null;
    const render = (email: string) =>
      act(() => {
        root.render(
          <BrainboxProvider transport={transport} identity={{ email }}>
            <Probe onInstance={(next) => (bb = next)} />
          </BrainboxProvider>,
        );
      });

    render("a@b.c");
    await act(() => bb!.draft().submit({ text: "one" }));
    expect(sent[0]?.metadata.identity).toEqual({ email: "a@b.c" });

    render("z@b.c");
    await act(() => bb!.draft().submit({ text: "two" }));
    expect(sent[1]?.metadata.identity).toEqual({ email: "z@b.c" });
  });

  it("passes the app's fields to the instance and follows changes to them", async () => {
    let bb: Brainbox | null = null;
    const render = (clinic: string) =>
      act(() => {
        root.render(
          <BrainboxProvider transport={transport} fields={[{ label: "Clinic", value: clinic }]}>
            <Probe onInstance={(next) => (bb = next)} />
          </BrainboxProvider>,
        );
      });

    render("Acme Vet");
    await act(() => bb!.draft().submit({ text: "one" }));
    expect(sent[0]?.metadata.fields).toEqual([{ label: "Clinic", value: "Acme Vet" }]);

    render("Northside Vet");
    await act(() => bb!.draft().submit({ text: "two" }));
    expect(sent[1]?.metadata.fields).toEqual([{ label: "Clinic", value: "Northside Vet" }]);
  });

  it("clears the fields when the prop is dropped, so they cannot outlive a sign-out", async () => {
    let bb: Brainbox | null = null;
    const render = (fields?: ReportField[]) =>
      act(() => {
        root.render(
          <BrainboxProvider transport={transport} fields={fields}>
            <Probe onInstance={(next) => (bb = next)} />
          </BrainboxProvider>,
        );
      });

    render([{ label: "Clinic", value: "Acme Vet" }]);
    render(undefined);
    await act(() => bb!.draft().submit({ text: "signed out" }));

    expect(sent[0]?.metadata).not.toHaveProperty("fields");
  });

  it("provides a caller-owned instance as is and leaves its lifecycle alone", () => {
    const own = createBrainbox({ transport });
    const seen: (Brainbox | null)[] = [];
    act(() => {
      root.render(
        <StrictMode>
          <BrainboxProvider brainbox={own}>
            <Probe onInstance={(bb) => seen.push(bb)} />
          </BrainboxProvider>
        </StrictMode>,
      );
    });
    // StrictMode runs the probe's effect twice; both times it is our instance
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((bb) => bb === own)).toBe(true);

    act(() => root.unmount());
    // still alive: the caller destroys it, not the provider
    expect(console.error).not.toBe(originalConsoleError);
    own.destroy();
    expect(console.error).toBe(originalConsoleError);
  });

  it("calls the latest onSubmitted without rebuilding the instance", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const instances: Brainbox[] = [];
    const render = (onSubmitted: () => void) =>
      act(() => {
        root.render(
          <BrainboxProvider transport={transport} onSubmitted={onSubmitted}>
            <Probe
              onInstance={(bb) => {
                if (bb) instances.push(bb);
              }}
            />
          </BrainboxProvider>,
        );
      });

    render(first);
    render(second);
    expect(new Set(instances).size).toBe(1);

    await act(() => instances[0]!.draft().submit({ text: "x" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: "r1" });
  });

  it("runs the latest beforeSend without rebuilding the instance", async () => {
    const instances: Brainbox[] = [];
    const render = (tag: string) =>
      act(() => {
        root.render(
          <BrainboxProvider
            transport={transport}
            privacy={{ maskAllText: true }}
            beforeSend={(report) => ({ ...report, text: `${report.text ?? ""} ${tag}` })}
          >
            <Probe
              onInstance={(bb) => {
                if (bb) instances.push(bb);
              }}
            />
          </BrainboxProvider>,
        );
      });

    render("first");
    render("scrubbed");
    expect(new Set(instances).size).toBe(1);

    await act(() => instances[0]!.draft().submit({ text: "x" }));
    expect(sent[0]?.text).toBe("x scrubbed");
  });

  it("runs a beforeSend that only arrives on a later render", async () => {
    const instances: Brainbox[] = [];
    const render = (beforeSend?: (report: Report) => Report) =>
      act(() => {
        root.render(
          <BrainboxProvider transport={transport} beforeSend={beforeSend}>
            <Probe
              onInstance={(bb) => {
                if (bb) instances.push(bb);
              }}
            />
          </BrainboxProvider>,
        );
      });

    render();
    render((report) => ({ ...report, text: "scrubbed" }));
    expect(new Set(instances).size).toBe(1);

    await act(() => instances[0]!.draft().submit({ text: "Jane Doe" }));
    expect(sent[0]?.text).toBe("scrubbed");
  });

  it("leaves console.error alone with consoleErrors off", () => {
    let bb: Brainbox | null = null;
    act(() => {
      root.render(
        <BrainboxProvider transport={transport} consoleErrors={false}>
          <Probe onInstance={(next) => (bb = next)} />
        </BrainboxProvider>,
      );
    });
    expect(bb).not.toBeNull();
    expect(console.error).toBe(originalConsoleError);
  });

  it("creates the instance with the loader, recording and screenshot options", async () => {
    const record = vi.fn(() => () => {});
    const domToCanvas = vi.fn(async () => document.createElement("canvas"));
    const loader: CaptureLoader = {
      recorder: vi.fn(async () => ({ record: record as never })),
      rasteriser: vi.fn(async () => ({ domToCanvas: domToCanvas as never })),
    };
    let bb: Brainbox | null = null;
    act(() => {
      root.render(
        <BrainboxProvider
          transport={transport}
          loader={loader}
          recording={{ audio: false, rrweb: { recordCanvas: true } }}
          screenshot={{ assetTimeoutMs: 1500 }}
        >
          <Probe onInstance={(next) => (bb = next)} />
        </BrainboxProvider>,
      );
    });
    const instance = bb as Brainbox | null;
    if (!instance) throw new Error("no instance");

    instance.preloadCapture();
    expect(loader.recorder).toHaveBeenCalled();
    expect(loader.rasteriser).toHaveBeenCalled();

    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    // jsdom can't paint; the screenshot fails quietly after reaching the rasteriser
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const draft = instance.draft();
      draft.startRecording();
      await vi.waitFor(() => expect(record).toHaveBeenCalled());
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ recordCanvas: true }));
      // the mic would be asked for right after rrweb starts
      await new Promise((r) => setTimeout(r, 0));
      expect(getUserMedia).not.toHaveBeenCalled();
      draft.cancel();

      draft.captureScreenshot();
      await vi.waitFor(() => expect(domToCanvas).toHaveBeenCalled());
      expect(domToCanvas).toHaveBeenCalledWith(
        document.documentElement,
        expect.objectContaining({ timeout: 1500 }),
      );
      draft.cancel();
    } finally {
      getContext.mockRestore();
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});
