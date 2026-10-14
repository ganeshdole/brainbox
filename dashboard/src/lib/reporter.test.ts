import { describe, expect, it } from "vitest";

import {
  cleanIdentity,
  fieldHref,
  hasReporter,
  highlightLine,
  initials,
  reporterSummary,
} from "./reporter.ts";

const fields = [
  { label: "Clinic", value: "Acme Vet", highlight: true },
  { label: "Location", value: "Downtown", highlight: true },
  { label: "Tenant ID", value: "t-1", type: "id" as const },
];

describe("highlightLine", () => {
  it("joins only the values the app highlighted, in its order", () => {
    expect(highlightLine(fields)).toBe("Acme Vet · Downtown");
    expect(highlightLine([{ label: "Plan", value: "Pro" }])).toBe("");
  });
});

describe("reporterSummary", () => {
  it("copies the name, contact details and every field as text", () => {
    expect(reporterSummary({ name: "Priya Shah", email: "priya@acme.vet", id: "u1" }, fields)).toBe(
      [
        "Priya Shah",
        "Email: priya@acme.vet",
        "Clinic: Acme Vet",
        "Location: Downtown",
        "Tenant ID: t-1",
        "User ID: u1",
      ].join("\n"),
    );
  });
});

describe("fieldHref", () => {
  it("links emails, phones and web addresses", () => {
    expect(fieldHref({ type: "email", value: "ana@acme.co" })).toBe("mailto:ana@acme.co");
    expect(fieldHref({ type: "phone", value: "+1 (555) 201-8842" })).toBe("tel:+15552018842");
    expect(fieldHref({ type: "url", value: "https://acme.co/a" })).toBe("https://acme.co/a");
  });

  it("never links a script URL the host app sent", () => {
    expect(fieldHref({ type: "url", value: "javascript:alert(1)" })).toBeNull();
    expect(fieldHref({ type: "url", value: "not a url" })).toBeNull();
  });

  it("shows plain text and ids as text", () => {
    expect(fieldHref({ type: "text", value: "Acme Vet" })).toBeNull();
    expect(fieldHref({ type: "id", value: "t-1" })).toBeNull();
    expect(fieldHref({ value: "Acme Vet" })).toBeNull();
  });
});

describe("initials", () => {
  it("takes the first and last name, else the start of the email", () => {
    expect(initials({ name: "Priya Anand Shah" })).toBe("PS");
    expect(initials({ name: "Priya" })).toBe("PR");
    expect(initials({ email: "ops@acme.co" })).toBe("OP");
  });
});

describe("cleanIdentity", () => {
  it("trims each part and drops blank ones, so the email shows instead of an empty name", () => {
    expect(cleanIdentity({ name: "   ", email: " ana@acme.co " })).toEqual({ email: "ana@acme.co" });
    expect(cleanIdentity(undefined)).toEqual({});
  });
});

describe("hasReporter", () => {
  it("is false for an anonymous report", () => {
    expect(hasReporter(undefined)).toBe(false);
    expect(hasReporter({})).toBe(false);
    expect(hasReporter({ name: "  " })).toBe(false);
    expect(hasReporter({ phone: "+1 555" })).toBe(true);
  });
});
