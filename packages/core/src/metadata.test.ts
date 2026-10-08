import { afterEach, describe, expect, it } from "vitest";
import { captureErrors, captureMetadata, type ErrorLog } from "./metadata.ts";

const original = console.error;
const live: ErrorLog[] = [];
const start = (max?: number) => {
  const log = captureErrors(max);
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

  it("keeps a separate buffer per log", () => {
    const a = start();
    console.error("only-a");
    const b = start();
    console.error("both");
    expect(a.snapshot()).toEqual(["only-a", "both"]);
    expect(b.snapshot()).toEqual(["both"]);
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
});
