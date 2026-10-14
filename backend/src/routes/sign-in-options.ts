import type { SignInOptions } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";

import type { AppEnv } from "../types.ts";

/** How email sign-in works on this deployment, so the dashboard knows whether
 *  to ask for a code. Public: the login page reads it before anyone signs in. */
export const signInOptions = new Hono<AppEnv>().get("/", (c) =>
  c.json<SignInOptions>({ email: c.get("deps").auth?.emailMode ?? "link", google: !!c.get("deps").auth?.google }),
);
