import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.ts";

/** A Drizzle client over a postgres.js pool, for `createPostgresStore()`. The
 *  pool connects on its first query; `options` go to postgres.js (the Workers
 *  entry opens a small one per request). `db.$client.end()` closes it. */
export function connectPostgres(url: string, options?: postgres.Options<Record<string, never>>) {
  return drizzle(postgres(url, options), { schema });
}

export type DB = ReturnType<typeof connectPostgres>;
