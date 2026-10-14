import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.ts";

/** A Drizzle client over a postgres.js pool, for `createPostgresStore()`. The
 *  pool connects on its first query. */
export function connectPostgres(url: string) {
  return drizzle(postgres(url), { schema });
}

export type DB = ReturnType<typeof connectPostgres>;
