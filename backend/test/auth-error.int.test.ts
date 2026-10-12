import { describe, expect, it } from "vitest";

import { app } from "../src/app.ts";
import { env } from "../src/env.ts";

const location = async (path: string) => {
  const res = await app.request(path, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
};

describe("a failed sign-in", () => {
  it("lands on a valid URL that forwards to the dashboard with the code", async () => {
    // A magic link whose token is unknown or expired: Auth.js throws
    // Verification and builds its redirect as the API origin + pages.error.
    const failed = await location(
      "/api/auth/callback/magic-link?token=not-a-token&email=someone%40test.local",
    );
    expect(failed.status).toBe(302);
    const target = new URL(failed.location ?? "");
    expect(target.pathname).toBe("/auth-error");
    expect(target.searchParams.get("error")).toBe("Verification");

    const forwarded = await location(`${target.pathname}${target.search}`);
    expect(forwarded.location).toBe(`${env.DASHBOARD_ORIGIN}/login?error=Verification`);
  });

  it("drops the 'undefined' code Auth.js writes when its error page is opened bare", async () => {
    const bare = await location("/api/auth/error");
    expect(bare.location).toContain("/auth-error?error=undefined");

    const forwarded = await location("/auth-error?error=undefined");
    expect(forwarded.location).toBe(`${env.DASHBOARD_ORIGIN}/login`);
  });

  it("passes on only single-word codes", async () => {
    const forwarded = await location("/auth-error?error=%3Cscript%3E");
    expect(forwarded.location).toBe(`${env.DASHBOARD_ORIGIN}/login`);
  });
});
