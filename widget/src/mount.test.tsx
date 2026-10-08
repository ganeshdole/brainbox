import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Transport } from "@brainbox/core";
import { mount, type WidgetHandle } from "./mount.tsx";

const transport: Transport = { send: async () => ({ id: "r1" }) };
const originalConsoleError = console.error;

const shadow = () => document.getElementById("brainbox-widget")?.shadowRoot ?? null;
const labels = () =>
  Array.from(shadow()?.querySelectorAll("button") ?? []).map(
    (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "",
  );

let widget: WidgetHandle | null = null;

afterEach(() => {
  act(() => widget?.destroy());
  widget = null;
});

describe("mount", () => {
  it("puts the widget on the page and takes everything down again on destroy", () => {
    act(() => {
      widget = mount({ transport });
    });

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

  it("opens and closes through the handle", () => {
    act(() => {
      widget = mount({ transport, trigger: "manual", position: "top-left" });
    });
    expect(labels()).toEqual([]);

    act(() => widget?.open());
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(true);

    act(() => widget?.close());
    expect(labels()).toEqual([]);
  });
});
