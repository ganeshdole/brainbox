import { describe, expect, it } from "vitest";

import { fieldHref, hasReporter, initials } from "./reporter.ts";

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

describe("hasReporter", () => {
  it("is false for an anonymous report", () => {
    expect(hasReporter(undefined)).toBe(false);
    expect(hasReporter({})).toBe(false);
    expect(hasReporter({ phone: "+1 555" })).toBe(true);
  });
});
