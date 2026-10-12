import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env.ts";
import * as schema from "./schema/index.ts";

function connect() {
  return drizzle(postgres(env.DATABASE_URL), { schema });
}

export type DB = ReturnType<typeof connect>;

let instance: DB | null = null;

/** The Postgres pool, opened on first use and kept for the life of the
 *  process, so a deployment on another store never needs DATABASE_URL. */
export function getDb(): DB {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  instance ??= connect();
  return instance;
}
