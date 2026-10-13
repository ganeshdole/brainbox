import { eq } from "drizzle-orm";

import { getDb } from "../src/db/client.ts";
import { projects, teamMembers, teams, users } from "../src/db/schema/index.ts";

const db = getDb();

const EMAIL = "seed@brainbox.local";
const KEY = "pk_test_local" as const;

async function seed() {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: EMAIL, name: "Seed User" })
      .returning();
  }
  if (!user) throw new Error("Failed to create seed user");

  // The seed user's own Team, under their id as migrated Accounts have.
  await db.insert(teams).values({ id: user.id, name: "Seed User's team" }).onConflictDoNothing();
  await db.insert(teamMembers).values({ teamId: user.id, userId: user.id, role: "owner" }).onConflictDoNothing();

  let [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.key, KEY))
    .limit(1);
  if (!project) {
    [project] = await db
      .insert(projects)
      .values({
        teamId: user.id,
        name: "Local Test Project",
        key: KEY,
        allowedOrigins: [],
      })
      .returning();
  }
  if (!project) throw new Error("Failed to create seed project");

  console.log(
    `Seeded: project key=${project.key} id=${project.id} owner=${user.id}`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
