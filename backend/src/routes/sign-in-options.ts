import type { SignInOptions } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";

import { env } from "../env.ts";

/** How email sign-in works on this deployment, so the dashboard knows whether
 *  to ask for a code. Public: the login page reads it before anyone signs in. */
export const signInOptions = new Hono().get("/", (c) =>
  c.json<SignInOptions>({ email: env.AUTH_EMAIL_MODE }),
);
