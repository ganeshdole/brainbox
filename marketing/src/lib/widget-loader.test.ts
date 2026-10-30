import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadWidget,
  onWidgetReady,
  openWidget,
  resolveWidgetConfig,
} from "./widget-loader.ts";

afterEach(() => {
  document.body.innerHTML = "";
  delete window.Brainbox;
  vi.useRealTimers();
});

describe("resolveWidgetConfig", () => {
  it("falls back to the demo project and prod ingest endpoint", () => {
    const config = resolveWidgetConfig({});
    expect(config.project).toMatch(/^pk_/);
    expect(config.endpoint).toBe("https://app.brainbox.sh/ingest");
  });

  it("defaults to the same widget URL customers are given, not a bundled copy", () => {
    expect(resolveWidgetConfig({}).src).toBe("https://app.brainbox.sh/widget.js");
  });

  it("lets env values override the defaults", () => {
    const config = resolveWidgetConfig({
      VITE_DEMO_PROJECT_KEY: "pk_test_local",
      VITE_DEMO_ENDPOINT: "http://localhost:8787/ingest",
      VITE_DEMO_WIDGET_SRC: "/widget.js",
    });
    expect(config.project).toBe("pk_test_local");
    expect(config.endpoint).toBe("http://localhost:8787/ingest");
    expect(config.src).toBe("/widget.js");
  });
});

describe("loadWidget", () => {
  const config = { project: "pk_a", endpoint: "http://x/ingest", src: "https://cdn.test/widget.js" };

  it("injects a classic script tag with the widget config", () => {
    loadWidget(config);
    const script = document.querySelector<HTMLScriptElement>("script[data-brainbox-demo]")!;
    expect(script.getAttribute("src")).toBe("https://cdn.test/widget.js");
    expect(script.dataset.project).toBe("pk_a");
    expect(script.dataset.endpoint).toBe("http://x/ingest");
    expect(script.type).toBe("");
  });

  it("is idempotent across repeat calls (StrictMode double-effect)", () => {
    loadWidget(config);
    loadWidget(config);
    expect(document.querySelectorAll("script[data-brainbox-demo]")).toHaveLength(1);
  });
});

describe("onWidgetReady", () => {
  it("fires immediately when the widget is already up", () => {
    window.Brainbox = { open: vi.fn(), close: vi.fn() };
    const cb = vi.fn();
    onWidgetReady(cb);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("waits for the async script, then fires exactly once", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    onWidgetReady(cb);

    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();

    window.Brainbox = { open: vi.fn(), close: vi.fn() };
    vi.advanceTimersByTime(150);
    expect(cb).toHaveBeenCalledOnce();

    // The poll must stop, or one click would open the widget again and again.
    vi.advanceTimersByTime(5_000);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("gives up rather than waiting forever on a blocked widget", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    // Interval divides the timeout exactly, so the give-up tick lands at 1000ms.
    onWidgetReady(cb, { intervalMs: 100, timeoutMs: 1_000 });

    vi.advanceTimersByTime(1_000);
    window.Brainbox = { open: vi.fn(), close: vi.fn() };
    vi.advanceTimersByTime(10_000);

    expect(cb).not.toHaveBeenCalled();
  });

  it("stops polling after cleanup", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    onWidgetReady(cb)();

    window.Brainbox = { open: vi.fn(), close: vi.fn() };
    vi.advanceTimersByTime(5_000);

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("openWidget", () => {
  it("opens the widget when it has loaded", () => {
    const open = vi.fn();
    window.Brainbox = { open, close: vi.fn() };
    openWidget();
    expect(open).toHaveBeenCalledOnce();
  });

  it("opens it on arrival when the visitor clicks before the script lands", () => {
    vi.useFakeTimers();
    expect(() => openWidget()).not.toThrow();

    const open = vi.fn();
    window.Brainbox = { open, close: vi.fn() };
    vi.advanceTimersByTime(150);

    expect(open).toHaveBeenCalledOnce();
  });
});
