import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "./theme.ts";

/** A stand-in for the OS colour setting that tests can flip. */
function stubPrefersDark(initial: boolean) {
  let listener: (() => void) | null = null;
  const query = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => (listener = fn),
    removeEventListener: () => (listener = null),
  };
  vi.stubGlobal("matchMedia", () => query);
  return {
    set(dark: boolean) {
      query.matches = dark;
      listener?.();
    },
    listening: () => listener !== null,
  };
}

describe("applyTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets dark or light as asked", () => {
    const el = document.createElement("div");
    el.className = "bb-root dark";
    applyTheme(el, "light");
    expect(el.className).toBe("bb-root");
    applyTheme(el, "dark");
    expect(el.classList.contains("dark")).toBe(true);
  });

  it("follows the OS setting for system, live, until cleaned up", () => {
    const os = stubPrefersDark(false);
    const el = document.createElement("div");

    const cleanup = applyTheme(el, "system");
    expect(el.classList.contains("dark")).toBe(false);
    os.set(true);
    expect(el.classList.contains("dark")).toBe(true);

    cleanup();
    expect(os.listening()).toBe(false);
  });
});
