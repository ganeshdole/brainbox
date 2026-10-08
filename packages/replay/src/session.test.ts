import { describe, expect, it } from "vitest";
import { parseSessionPayload } from "./session.ts";

describe("parseSessionPayload", () => {
  it("reads events and the audio offset", () => {
    const payload = parseSessionPayload(
      JSON.stringify({ v: 1, events: [{ type: 4 }, { type: 2 }], audioOffsetMs: 420 }),
    );
    expect(payload.events).toHaveLength(2);
    expect(payload.audioOffsetMs).toBe(420);
  });

  it("defaults the offset to 0 for older logs without one", () => {
    expect(parseSessionPayload(JSON.stringify({ v: 1, events: [] })).audioOffsetMs).toBe(0);
  });

  it("ignores a negative or non-numeric offset", () => {
    expect(
      parseSessionPayload(JSON.stringify({ events: [], audioOffsetMs: -50 })).audioOffsetMs,
    ).toBe(0);
    expect(
      parseSessionPayload(JSON.stringify({ events: [], audioOffsetMs: "9" })).audioOffsetMs,
    ).toBe(0);
  });

  it("returns empty events for a malformed payload", () => {
    expect(parseSessionPayload("null").events).toEqual([]);
    expect(parseSessionPayload('{"events": 3}').events).toEqual([]);
  });
});
