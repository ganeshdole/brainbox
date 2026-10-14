import { Hono } from "hono";

import type { AppEnv } from "../types.ts";

/**
 * Where Auth.js sends a failed sign-in (`pages.error` in auth/config.ts).
 * When a sign-in step throws, Auth.js builds the redirect as the API's own
 * origin plus this value, so it must be a path here, not the dashboard's URL:
 * a full URL came out as `http://apihttp://dashboard/login` and crashed the
 * request. This route hands the user on to the dashboard's /login. A proxy in
 * front of the API must forward this path to it (deploy/Caddyfile does).
 */
export const AUTH_ERROR_PATH = "/auth-error";

// Auth.js error codes are single words, e.g. "Verification". Anything else is
// dropped, including the literal "undefined" Auth.js writes when its error page
// is opened without a code; the dashboard then shows no error at all.
const ERROR_CODE = /^[A-Za-z]+$/;

export const authError = new Hono<AppEnv>().get("/", (c) => {
  const code = c.req.query("error");
  const login = new URL("/login", c.get("deps").options.dashboardOrigin);
  if (code && code !== "undefined" && ERROR_CODE.test(code)) login.searchParams.set("error", code);
  return c.redirect(login.toString(), 302);
});
