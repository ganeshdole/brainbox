import { afterEach, describe, expect, it, vi } from "vitest";
import { isScrollKey, lockScroll } from "./scroll-lock.ts";

describe("isScrollKey", () => {
  it("catches the keys that scroll a page", () => {
    for (const key of [" ", "PageDown", "End", "ArrowDown"]) {
      expect(isScrollKey(key, document.body)).toBe(true);
    }
  });

  it("ignores keys that don't scroll", () => {
    expect(isScrollKey("a", document.body)).toBe(false);
    expect(isScrollKey("Escape", document.body)).toBe(false);
  });

  it("leaves a text field's caret keys alone", () => {
    expect(isScrollKey(" ", document.createElement("input"))).toBe(false);
    expect(isScrollKey("ArrowLeft", document.createElement("textarea"))).toBe(false);
  });
});

describe("lockScroll", () => {
  let unlock = () => {};
  afterEach(() => unlock());

  const fire = (e: Event) => {
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it("cancels wheel, touch and keyboard scrolling", () => {
    unlock = lockScroll();
    expect(fire(new WheelEvent("wheel", { cancelable: true }))).toBe(true);
    expect(fire(new Event("touchmove", { cancelable: true }))).toBe(true);
    expect(fire(new KeyboardEvent("keydown", { key: "PageDown", cancelable: true }))).toBe(true);
    expect(fire(new KeyboardEvent("keydown", { key: "z", cancelable: true }))).toBe(false);
  });

  it("snaps back a scroll it could not cancel", () => {
    const scrollTo = vi.fn();
    Object.assign(window, { scrollTo, scrollY: 0 });
    unlock = lockScroll();
    Object.assign(window, { scrollY: 300 });
    fire(new Event("scroll"));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    Object.assign(window, { scrollY: 0 });
  });

  it("lets the page scroll again once unlocked", () => {
    lockScroll()();
    expect(fire(new WheelEvent("wheel", { cancelable: true }))).toBe(false);
  });
});
