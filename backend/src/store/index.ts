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
  instance ??= createStore();
  return instance;
}

/** Use `store` instead of the DATABASE_DRIVER one: how an entry plugs in a
 *  database this repo does not ship (DATABASE_DRIVER=custom). Call it before
 *  serving. `null` goes back to the configured driver. */
export function setStore(store: Store | null): void {
  instance = store;
}

function createStore(): Store {
  switch (env.DATABASE_DRIVER) {
    case "postgres":
      return createPostgresStore(getDb());
    case "convex":
      return createConvexStore(getConvex());
    case "custom":
      throw new Error("DATABASE_DRIVER=custom, but no store was given to setStore()");
  }
}
