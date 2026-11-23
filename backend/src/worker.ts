import { AsyncLocalStorage } from "node:async_hooks";

import type { Hono } from "hono";

import { createApp } from "./create-app.ts";
import { connectPostgres } from "./db/connect.ts";
import { env } from "./env.ts";
import { fromEnv, lazyStore } from "./from-env.ts";
import { serveThenCleanUp, type WorkerContext } from "./runtime/workers.ts";
import { R2BucketStorage, type R2BucketLike } from "./storage/r2-bucket.ts";
import { createPostgresStore } from "./store/postgres.ts";
import type { FullStore } from "./store/types.ts";
import type { AppEnv } from "./types.ts";

// Cloudflare Workers entry (wrangler.jsonc). The same app the Node server and
// Azure Functions run, with Postgres reached through Hyperdrive and files in
// an R2 bucket. Vars and secrets arrive as process.env (nodejs_compat), so
// env.ts reads them as on any host; DATABASE_DRIVER and STORAGE_DRIVER are
// `custom` because this file builds the store and the storage itself.

interface Bindings {
  /** Hyperdrive in front of the Postgres database. */
  HYPERDRIVE: { connectionString: string };
  /** The bucket that holds screenshots, recordings, sessions and audio. */
  FILES: R2BucketLike;
}

// A Worker may not reuse one request's socket in another, so each request gets
// its own connection (Hyperdrive pools the real ones) and its own store.
const requestStore = new AsyncLocalStorage<FullStore>();

function currentStore(): FullStore {
  const store = requestStore.getStore();
  if (!store) throw new Error("The store was used outside a request");
  return store;
}

let app: Hono<AppEnv> | null = null;

function appFor(bindings: Bindings): Hono<AppEnv> {
  app ??= createApp({
    ...fromEnv(),
    store: lazyStore(currentStore),
    storage: new R2BucketStorage(bindings.FILES, { publicUrl: env.PUBLIC_API_URL }),
  });
  return app;
}

export default {
  fetch(request: Request, bindings: Bindings, ctx: WorkerContext): Promise<Response> {
    const db = connectPostgres(bindings.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
    const served = appFor(bindings);
    return requestStore.run(createPostgresStore(db), () =>
      serveThenCleanUp(
        ctx,
        async (scoped) => served.fetch(request, bindings, { ...scoped, props: scoped.props }),
        () => db.$client.end(),
      ),
    );
  },
};
