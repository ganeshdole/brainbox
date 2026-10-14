import { env } from "../src/env.ts";
import { generateProjectKey } from "../src/lib/projectKey.ts";
import { getStore } from "../src/store/index.ts";
import type { NewIssue } from "../src/store/types.ts";

// Seeds e2e/tests/parts.spec.ts into the database reset-e2e-db.ts just
// recreated: one Account (PARTS_EMAIL) owning a Team with a project of two bug
// reports and a feature request. Prints the project id as JSON on stdout.

const PARTS_EMAIL = "lin.parts@acme.test";

const metadata = (path: string, title: string): NewIssue["metadata"] => ({
  url: `https://app.acme.test${path}`,
  title,
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  userAgent: "Mozilla/5.0",
  language: "en",
  timezone: "UTC",
  consoleErrors: [],
});

async function seed() {
  // the same rule as reset-e2e-db.ts: only an e2e database (brainbox_e2e_<checkout>)
  if (!/(^|_)e2e(_|$)/.test(new URL(env.DATABASE_URL).pathname.slice(1))) {
    throw new Error("seed-e2e-parts seeds only an e2e database");
  }
  const store = getStore();
  const adapter = store.auth.adapter();
  if (!adapter.createUser) throw new Error("auth adapter cannot create users");
  const user = await adapter.createUser({ id: crypto.randomUUID(), email: PARTS_EMAIL, emailVerified: null, name: "Lin" });
  const team = await store.teams.create({ name: "Acme", ownerId: user.id });
  const project = await store.projects.create({ teamId: team.id, name: "Acme Shop", key: generateProjectKey(), allowedOrigins: [] });

  const base = {
    projectId: project.id,
    importance: null,
    screenshotKey: null,
    cropKey: null,
    videoKey: null,
    videoMime: null,
    videoTranscriptStatus: null,
    sessionKey: null,
    audioKey: null,
    audioMime: null,
    audioTranscriptStatus: null,
    region: null,
  } as const;
  await store.issues.create({
    ...base,
    id: crypto.randomUUID(),
    kind: "bug",
    text: "Checkout button overlaps the total",
    metadata: metadata("/checkout", "Checkout"),
  });
  await store.issues.create({
    ...base,
    id: crypto.randomUUID(),
    kind: "bug",
    text: "Coupon field rejects lowercase codes",
    metadata: metadata("/cart", "Cart"),
  });
  await store.issues.create({
    ...base,
    id: crypto.randomUUID(),
    kind: "feature",
    importance: "important",
    text: "Let me save my cart for later",
    metadata: metadata("/cart", "Cart"),
  });

  console.log(JSON.stringify({ projectId: project.id, email: PARTS_EMAIL }));
  process.exit(0);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
