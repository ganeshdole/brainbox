import { db } from "../db/client.ts";
import { createPostgresStore } from "./postgres.ts";
import type { Store } from "./types.ts";

export type * from "./types.ts";

let instance: Store | null = null;

/** The deployment's store, created on first use. Routes read it from the
 *  request context (`c.get("store")`); code outside a request calls this. */
export function getStore(): Store {
  instance ??= createPostgresStore(db);
  return instance;
}
