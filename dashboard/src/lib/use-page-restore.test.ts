import { describe, expect, it, vi } from "vitest";

import { onPageRestore } from "./use-page-restore";

function pageshow(persisted: boolean): Event {
  const e = new Event("pageshow");
  Object.defineProperty(e, "persisted", { value: persisted });
  return e;
}

describe("onPageRestore", () => {
  it("resets when the page is restored from the back/forward cache", () => {
    const reset = vi.fn();
    onPageRestore(window, reset);
    window.dispatchEvent(pageshow(true));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("leaves a normal load alone", () => {
    const reset = vi.fn();
    onPageRestore(window, reset);
    window.dispatchEvent(pageshow(false));
    expect(reset).not.toHaveBeenCalled();
  });

  it("stops listening after cleanup", () => {
    const reset = vi.fn();
    onPageRestore(window, reset)();
    window.dispatchEvent(pageshow(true));
    expect(reset).not.toHaveBeenCalled();
  });
});
