import { describe, expect, it } from "vitest";

import { requestGate } from "./latest";

describe("requestGate", () => {
  it("only the newest ticket is current", () => {
    const gate = requestGate();
    const first = gate.next();
    const second = gate.next();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("invalidate retires the tickets already out", () => {
    const gate = requestGate();
    const out = gate.next();
    gate.invalidate();
    expect(gate.isCurrent(out)).toBe(false);
    expect(gate.isCurrent(gate.next())).toBe(true);
  });
});
