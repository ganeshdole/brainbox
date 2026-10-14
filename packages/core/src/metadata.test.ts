import { afterEach, describe, expect, it, vi } from "vitest";
import { captureErrors, captureMetadata, type ErrorLog } from "./metadata.ts";

const original = console.error;
const live: ErrorLog[] = [];
const start = (max?: number) => {
  const log = captureErrors({ max });
  live.push(log);
  return log;
};

afterEach(() => {
  for (const log of live.splice(0)) log.stop();
});

describe("captureErrors", () => {
  it("buffers console.error while a log is listening", () => {
    const log = start();
    console.error("boom-marker-42");
    expect(log.snapshot().some((e) => e.includes("boom-marker-42"))).toBe(true);
  });

  it("caps the rolling buffer at 20 (oldest dropped)", () => {
    const log = start();
    for (let i = 0; i < 25; i++) console.error(`evt-${i}`);
    const errors = log.snapshot();
    expect(errors.length).toBeLessThanOrEqual(20);
    expect(errors.some((e) => e.includes("evt-24"))).toBe(true);
    expect(errors.some((e) => e.includes("evt-0"))).toBe(false);
  });

  it("keeps as many as asked for", () => {
    const log = start(3);
    for (let i = 0; i < 5; i++) console.error(`n-${i}`);
    expect(log.snapshot()).toEqual(["n-2", "n-3", "n-4"]);
  });

  it("keeps a separate buffer per log", () => {
    const a = start();
    console.error("only-a");
    const b = start();
    console.error("both");
    expect(a.snapshot()).toEqual(["only-a", "both"]);
    expect(b.snapshot()).toEqual(["both"]);
  });

  it("never throws on a value it can't stringify (#99)", () => {
    const log = start();
    const o = Object.create(null) as Record<string, unknown>;
    o.self = o;
    expect(() => console.error("bad", o, undefined)).not.toThrow();
    expect(log.snapshot()).toEqual(["bad [object Object] undefined"]);
  });

  it("still calls the original console.error when capture fails", () => {
    const spy = vi.fn();
    console.error = spy;
    try {
      const log = start();
      const fail = () => {
        throw new Error("unreadable");
      };
      // Every way of turning this into text throws, even the tag.
      const hostile = {
        toJSON: fail,
        toString: fail,
        get [Symbol.toStringTag]() {
          return fail();
        },
      };
      expect(() => console.error(hostile)).not.toThrow();
      // by identity: the matchers would try to print it and throw themselves
      expect(spy.mock.calls[0]?.[0] === hostile).toBe(true);
      expect(log.snapshot()).toEqual([]);
    } finally {
      for (const log of live.splice(0)) log.stop();
      console.error = original;
    }
  });

  it("restores console.error once the last log stops", () => {
    const a = start();
    const b = start();
    expect(console.error).not.toBe(original);
    a.stop();
    expect(console.error).not.toBe(original);
    b.stop();
    expect(console.error).toBe(original);
    // and a late error no longer lands anywhere
    console.error("after-stop");
    expect(a.snapshot()).not.toContain("after-stop");
  });
});

describe("captureMetadata", () => {
  it("carries identity, selector, the error buffer and the page fields", () => {
    const m = captureMetadata({
      consoleErrors: ["e1"],
      identity: { id: "u1", email: "a@b.c" },
      selector: "div#x",
    });
    expect(m.identity).toEqual({ id: "u1", email: "a@b.c" });
    expect(m.selector).toBe("div#x");
    expect(m.consoleErrors).toEqual(["e1"]);
    expect(typeof m.url).toBe("string");
    expect(m.viewport).toHaveProperty("width");
  });

  it("needs nothing but the page", () => {
    const m = captureMetadata();
    expect(m.consoleErrors).toEqual([]);
    expect(m.url).toBe(location.href);
    expect(m).not.toHaveProperty("fields");
  });
});
