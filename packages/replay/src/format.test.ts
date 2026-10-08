import { describe, expect, it } from "vitest";
import { formatClock } from "./format.ts";

describe("formatClock", () => {
  it("formats m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(83000)).toBe("1:23");
    expect(formatClock(600000)).toBe("10:00");
  });

  it("clamps negatives to zero", () => {
    expect(formatClock(-500)).toBe("0:00");
  });
});
