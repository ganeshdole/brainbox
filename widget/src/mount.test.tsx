import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Brainbox, Report, Transport } from "@ganeshdole/brainbox-core";
import { mount, type WidgetHandle } from "./mount.tsx";

// The handle does not expose its instance; keep the ones mount() creates so a
// test can submit a report through it.
const created = vi.hoisted((): Brainbox[] => []);
vi.mock("@ganeshdole/brainbox-core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@ganeshdole/brainbox-core")>();
  return {
    ...core,
    createBrainbox: (options: Parameters<typeof core.createBrainbox>[0]) => {
      const instance = core.createBrainbox(options);
      created.push(instance);
      return instance;
    },
  };
});

const transport: Transport = { send: async () => ({ id: "r1" }) };
const originalConsoleError = console.error;

const shadow = () => document.getElementById("brainbox-widget")?.shadowRoot ?? null;
const labels = () =>
  Array.from(shadow()?.querySelectorAll("button") ?? []).map(
    (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "",
  );

/** Let the widget's lazily loaded UI chunk (`widget-ui.tsx`) arrive and render. */
const uiReady = () =>
  act(async () => {
    await import("./widget-ui.tsx");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let widget: WidgetHandle | null = null;

afterEach(() => {
  act(() => widget?.destroy());
  widget = null;
});

describe("mount", () => {
  it("puts the widget on the page and takes everything down again on destroy", async () => {
    act(() => {
      widget = mount({ transport });
    });
    await uiReady();

    expect(document.getElementById("brainbox-widget")).not.toBeNull();
    expect(document.querySelector("[data-brainbox-root]")).not.toBeNull();
    expect(labels()).toEqual(["Send feedback"]);
    expect(console.error).not.toBe(originalConsoleError);

    act(() => widget?.destroy());
    widget = null;
    expect(document.getElementById("brainbox-widget")).toBeNull();
    expect(document.querySelector("[data-brainbox-root]")).toBeNull();
    expect(console.error).toBe(originalConsoleError);
  });

  it("opens and closes through the handle", async () => {
    act(() => {
      widget = mount({ transport, trigger: "manual", position: "top-left" });
    });
    expect(labels()).toEqual([]);

    act(() => widget?.open());
    await uiReady();
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(true);

    act(() => widget?.close());
    expect(labels()).toEqual([]);
  });

  it("sends the fields set through the handle with the next report", async () => {
    const sent: Report[] = [];
    const recording: Transport = {
      send: async (report) => {
        sent.push(report);
        return { id: "r2" };
      },
    };
    act(() => {
      widget = mount({ transport: recording, trigger: "manual" });
    });

    widget?.setFields([{ label: "Clinic", value: "Acme Vet" }]);
    await act(async () => {
      await created.at(-1)?.draft().submit({ text: "broken" });
    });

    expect(sent[0]?.metadata.fields).toEqual([{ label: "Clinic", value: "Acme Vet" }]);
  });

  it("honours a start() made before the widget has rendered", async () => {
    await act(async () => {
      widget = mount({ transport, trigger: "manual" });
      widget.start("screenshot");
    });
    await uiReady();

    // The markup toolbar, not the chooser.
    expect(labels()).toContain("Next");
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(false);
  });
});
