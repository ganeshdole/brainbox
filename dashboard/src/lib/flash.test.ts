import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flashTimer } from "./flash";

describe("flashTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns on, then off after the delay", () => {
    const set = vi.fn();
    flashTimer(set, 1500).trigger();
    expect(set).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1500);
    expect(set).toHaveBeenLastCalledWith(false);
  });

  it("a second trigger restarts the clock rather than ending early", () => {
    const set = vi.fn();
    const flash = flashTimer(set, 1500);
    flash.trigger();
    vi.advanceTimersByTime(1000);
    flash.trigger();
    vi.advanceTimersByTime(1000);
    expect(set).not.toHaveBeenCalledWith(false);
    vi.advanceTimersByTime(500);
    expect(set).toHaveBeenLastCalledWith(false);
  });

  it("dispose stops a pending switch-off", () => {
    const set = vi.fn();
    const flash = flashTimer(set, 1500);
    flash.trigger();
    flash.dispose();
    vi.advanceTimersByTime(2000);
    expect(set).not.toHaveBeenCalledWith(false);
  });
});
