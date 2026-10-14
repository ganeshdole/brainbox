import { env } from "../src/env.ts";
import { generateProjectKey } from "../src/lib/projectKey.ts";
import { getStore } from "../src/store/index.ts";

// Seeds the Azure DevOps e2e test (e2e/tests/azure-devops.spec.ts) into the
// database reset-e2e-db.ts just recreated: one Account owning a Team with an
// empty project. Prints the project's id and key as JSON on stdout.

const EMAIL = "grace.ado@acme.test";

async function seed() {
  // the same rule as reset-e2e-db.ts: only an e2e database (brainbox_e2e_<checkout>)
  if (!/(^|_)e2e(_|$)/.test(new URL(env.DATABASE_URL).pathname.slice(1))) {
    throw new Error("seed-e2e-azure-devops seeds only an e2e database");
  }
  const store = getStore();
  const adapter = store.authAdapter();
  if (!adapter.createUser) throw new Error("auth adapter cannot create users");
  const user = await adapter.createUser({
    id: crypto.randomUUID(),
    email: EMAIL,
    emailVerified: null,
    name: "Grace Hopper",
  });
  const team = await store.teams.create({ name: "Contoso", ownerId: user.id });
  const project = await store.projects.create({
    teamId: team.id,
    name: "Contoso app",
    key: generateProjectKey(),
    allowedOrigins: [],
  });
  console.log(JSON.stringify({ projectId: project.id, projectKey: project.key, email: EMAIL }));
  process.exit(0);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
