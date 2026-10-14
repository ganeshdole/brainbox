import type { BackendModule, Me } from "@ganeshdole/brainbox-shared";
import { Hono } from "hono";

import type { Deps } from "../deps.ts";
import type { AppEnv } from "../types.ts";

/** The optional parts of this deployment the dashboard shows: those the
 *  store has, and billing only when it is switched on as well. */
export function dashboardModules({ store, billing }: Deps): BackendModule[] {
  const modules: BackendModule[] = [];
  if (store.teams) modules.push("teams");
  if (store.triage) modules.push("triage");
  if (store.features) modules.push("features");
  if (store.integrations) modules.push("integrations");
  if (billing) modules.push("billing");
  return modules;
}

// Mounted behind verifyAuth(), so reaching the handler implies a valid session.
// Returns the authenticated user, and what this deployment offers them.
export const me = new Hono<AppEnv>().get("/", (c) => {
  const auth = c.get("authUser");
  return c.json<Me & typeof auth>({ ...auth, modules: dashboardModules(c.get("deps")) });
});
