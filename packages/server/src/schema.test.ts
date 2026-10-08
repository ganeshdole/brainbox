import { describe, expect, it } from "vitest";

import { feedbackSchema } from "./schema.ts";

const valid = {
  projectKey: "pk_abc",
  region: { x: 0, y: 0, width: 1, height: 1 },
  metadata: {
    url: "http://host/app",
    title: "App",
    viewport: { width: 1, height: 1 },
    devicePixelRatio: 1,
    userAgent: "x",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
};

describe("feedbackSchema", () => {
  it("accepts a valid payload", () => {
    expect(feedbackSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a projectKey without the pk_ prefix", () => {
    expect(feedbackSchema.safeParse({ ...valid, projectKey: "nope" }).success).toBe(false);
  });

  it("rejects text longer than 10000 chars", () => {
    expect(feedbackSchema.safeParse({ ...valid, text: "a".repeat(10_001) }).success).toBe(false);
  });

  it("rejects metadata missing a required field", () => {
    const metadata = {
      title: "App",
      viewport: { width: 1, height: 1 },
      devicePixelRatio: 1,
      userAgent: "x",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
    };
    expect(feedbackSchema.safeParse({ ...valid, metadata }).success).toBe(false);
  });

  it("rejects a malformed region", () => {
    expect(feedbackSchema.safeParse({ ...valid, region: { x: 0 } }).success).toBe(false);
  });

  it("accepts a payload with no region (screen recording)", () => {
    expect(feedbackSchema.safeParse({ ...valid, region: undefined }).success).toBe(true);
  });
});
