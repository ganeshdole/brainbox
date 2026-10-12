import { createMiddleware } from "hono/factory";

import { getStore } from "../store/index.ts";
import type { AppEnv } from "../types.ts";

// Expose the store on context so routes use c.get("store") rather than
// reaching for a database themselves.
export const storeMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("store", getStore());
  await next();
});
