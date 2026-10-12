import { join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { api } from "../convex/_generated/api.js";
import { TEST_SERVER_SECRET, TEST_STORE, testEnv } from "./env.ts";

// Runs once before the suite: prepare the store the suite will run against.
export default async function setup() {
  if (TEST_STORE === "convex") await checkConvex();
  else await migratePostgres();
}

/** Ensure the test DB exists, then apply migrations. */
async function migratePostgres() {
  const dbName = new URL(testEnv.DATABASE_URL!).pathname.slice(1);

  const adminUrl = new URL(testEnv.DATABASE_URL!);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1 });
  const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length === 0) await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  const client = postgres(testEnv.DATABASE_URL!, { max: 1 });
  await migrate(drizzle(client), {
    migrationsFolder: join(import.meta.dirname, "../drizzle"),
  });
  await client.end();
}

/** Fail fast, with the fix, when the local Convex deployment is not ready. */
async function checkConvex() {
  const url = testEnv.CONVEX_URL!;
  try {
    await new ConvexHttpClient(url).mutation(api.testing.reset, { secret: TEST_SERVER_SECRET });
  } catch (err) {
    throw new Error(
      `TEST_STORE=convex needs a local Convex deployment at ${url} with the test settings:\n` +
        "  cd backend && CONVEX_AGENT_MODE=anonymous npx convex dev\n" +
        `  npx convex env set BRAINBOX_SERVER_SECRET ${TEST_SERVER_SECRET}\n` +
        "  npx convex env set BRAINBOX_ALLOW_TEST_RESET true",
      { cause: err },
    );
  }
}
