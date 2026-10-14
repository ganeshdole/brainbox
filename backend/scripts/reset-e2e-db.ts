import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Recreates the end-to-end suite's database from the migrations, so every run
// of e2e/ starts empty and also proves the migrations apply from scratch.
// e2e/env.ts names it per checkout (brainbox_e2e_<folder>). Dropping is the
// point, so it refuses any database without an "e2e" word in its name.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const name = new URL(url).pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name) || !/(^|_)e2e(_|$)/.test(name)) {
  throw new Error(`refusing to reset "${name}": only an e2e database (brainbox_e2e_<checkout>) may be reset`);
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
