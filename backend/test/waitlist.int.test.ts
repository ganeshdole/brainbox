import { describe, expect, it, vi } from "vitest";

import { app } from "../src/app.ts";
import { stored } from "./harness.ts";
import * as emailModule from "../src/email/index.ts";

// Distinct source IPs keep each request in its own rate-limit bucket (the route
// keys the in-memory limiter off x-forwarded-for).
function post(email: unknown, ip = "10.0.0.1") {
  return app.request("/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email }),
  });
}

describe("POST /waitlist", () => {
  it("saves a new signup and marks the confirmation email sent", async () => {
    const res = await post("founder@acme.com", "10.0.0.1");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    const rows = await stored.waitlistSignups();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("founder@acme.com");
    expect(rows[0]!.source).toBe("marketing");
    expect(rows[0]!.emailStatus).toBe("sent");
  });

  it("normalizes case and whitespace to a single canonical row", async () => {
    expect((await post("  Founder@ACME.com  ", "10.0.0.2")).status).toBe(201);

    const second = await post("founder@acme.com", "10.0.0.3");
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, alreadyRegistered: true });

    const rows = await stored.waitlistSignups();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("founder@acme.com");
  });

  it("is idempotent and does not re-send to an existing signup", async () => {
    const emailer = emailModule.getEmailer();
    const sendSpy = vi.spyOn(emailer, "send");

    expect((await post("dup@acme.com", "10.0.0.4")).status).toBe(201);
    expect((await post("dup@acme.com", "10.0.0.5")).status).toBe(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(await stored.waitlistSignups()).toHaveLength(1);
    sendSpy.mockRestore();
  });

  it("rejects an invalid email with 400", async () => {
    expect((await post("not-an-email", "10.0.0.6")).status).toBe(400);
    expect((await post(undefined, "10.0.0.7")).status).toBe(400);
    expect(await stored.waitlistSignups()).toHaveLength(0);
  });

  it("still succeeds (signup saved) when the email send fails", async () => {
    const emailer = emailModule.getEmailer();
    const sendSpy = vi
      .spyOn(emailer, "send")
      .mockRejectedValueOnce(new Error("resend down"));

    const res = await post("resilient@acme.com", "10.0.0.8");
    expect(res.status).toBe(201);

    const rows = await stored.waitlistSignups();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailStatus).toBe("failed");
    expect(rows[0]!.emailError).toContain("resend down");
    sendSpy.mockRestore();
  });

  it("rate-limits a single IP after repeated submissions", async () => {
    const ip = "10.9.9.9";
    // 5 allowed within the window; the 6th trips the limit.
    for (let i = 0; i < 5; i++) {
      expect((await post(`rl-${i}@acme.com`, ip)).status).not.toBe(429);
    }
    expect((await post("rl-6@acme.com", ip)).status).toBe(429);
  });
});
