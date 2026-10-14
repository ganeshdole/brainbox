import { describe, expect, it } from "vitest";

import { feedbackSchema, REPORT_FIELD_LIMITS } from "./schema.ts";

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

  it("accepts a feature request's kind and importance, and nothing else for them", () => {
    expect(feedbackSchema.safeParse({ ...valid, kind: "feature", importance: "critical" }).success).toBe(true);
    expect(feedbackSchema.safeParse({ ...valid, kind: "idea" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, importance: "urgent" }).success).toBe(false);
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

  it("accepts the host app's own fields and a named reporter", () => {
    const metadata = {
      ...valid.metadata,
      identity: { id: "u1", email: "a@b.co", name: "Ana", phone: "+1 555 0100" },
      fields: [
        { label: "Clinic", value: "Acme Vet" },
        { label: "Tenant ID", value: "t-1", type: "id" },
      ],
    };
    expect(feedbackSchema.safeParse({ ...valid, metadata }).success).toBe(true);
  });

  it("trims the reporter and the fields, so blank values are stored empty", () => {
    const metadata = {
      ...valid.metadata,
      identity: { name: "   ", phone: " +1 555 0100 " },
      fields: [{ label: " Clinic ", value: "   " }],
    };
    const parsed = feedbackSchema.parse({ ...valid, metadata });
    expect(parsed.metadata.identity).toEqual({ name: "", phone: "+1 555 0100" });
    expect(parsed.metadata.fields).toEqual([{ label: "Clinic", value: "" }]);
    const blankLabel = [{ label: "   ", value: "x" }];
    expect(feedbackSchema.safeParse({ ...valid, metadata: { ...valid.metadata, fields: blankLabel } }).success).toBe(false);
  });

  it("caps the host app's fields so one report cannot carry unbounded data", () => {
    const field = { label: "Clinic", value: "Acme Vet" };
    const tooMany = Array.from({ length: REPORT_FIELD_LIMITS.count + 1 }, () => field);
    const tooLong = [{ label: "Clinic", value: "a".repeat(REPORT_FIELD_LIMITS.value + 1) }];
    const unknownType = [{ ...field, type: "password" }];
    for (const fields of [tooMany, tooLong, unknownType]) {
      expect(feedbackSchema.safeParse({ ...valid, metadata: { ...valid.metadata, fields } }).success).toBe(false);
    }
  });

  it("rejects a malformed region", () => {
    expect(feedbackSchema.safeParse({ ...valid, region: { x: 0 } }).success).toBe(false);
  });

  it("accepts a payload with no region (screen recording)", () => {
    expect(feedbackSchema.safeParse({ ...valid, region: undefined }).success).toBe(true);
  });
});
