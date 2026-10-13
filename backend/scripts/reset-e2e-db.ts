import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Recreates the end-to-end suite's database from the migrations, so every run
// of e2e/ starts empty and also proves the migrations apply from scratch.
// Refuses any database whose name does not end in _e2e: dropping is the point.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const name = new URL(url).pathname.slice(1);
if (!/^[a-z0-9_]+_e2e$/.test(name)) {
  throw new Error(`refusing to reset "${name}": only a database named *_e2e may be reset`);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
await admin.unsafe(`drop database if exists "${name}" with (force)`);
await admin.unsafe(`create database "${name}"`);
await admin.end();

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: join(import.meta.dirname, "../drizzle") });
await client.end();
console.log(`[e2e] ${name} recreated and migrated`);
