import { getConvex } from "../convex-client.ts";
import { getDb } from "../db/client.ts";
import { env } from "../env.ts";
import { createConvexStore } from "./convex.ts";
import { createPostgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

export type * from "./types.ts";

let instance: Store | null = null;

/** The deployment's store (DATABASE_DRIVER), created on first use. Routes read
 *  it from the request context (`c.get("store")`); code outside a request
 *  calls this. */
export function getStore(): Store {
  instance ??= env.DATABASE_DRIVER === "convex" ? createConvexStore(getConvex()) : createPostgresStore(getDb());
  return instance;
}
