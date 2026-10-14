import { env } from "../env.ts";
import { connectPostgres, type DB } from "./connect.ts";

export type { DB } from "./connect.ts";

let instance: DB | null = null;

/** The Postgres pool, opened on first use and kept for the life of the
 *  process, so a deployment on another store never needs DATABASE_URL. */
export function getDb(): DB {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  instance ??= connectPostgres(env.DATABASE_URL);
  return instance;
}
