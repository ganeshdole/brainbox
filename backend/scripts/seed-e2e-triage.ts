import { env } from "../src/env.ts";
import { generateProjectKey } from "../src/lib/projectKey.ts";
import { getStore } from "../src/store/index.ts";

// Seeds the triage e2e test (e2e/tests/triage.spec.ts) into the database
// reset-e2e-db.ts just recreated: one Account (TRIAGE_EMAIL) owning a Team with
// a project of reports at every stage of triage. Prints the project id as JSON
// on stdout. Run once per e2e run, after the reset; it adds, never deletes.

const TRIAGE_EMAIL = "ada.triage@acme.test";

const HOUR = 3_600_000;

/** [note, page path, page title, console errors, reporter, hours ago] */
const REPORTS: Array<[string, string, string, string[], string | null, number]> = [
  ["Save button does nothing on the billing page", "/billing", "Billing", ["TypeError: cannot read properties of undefined (reading 'plan')"], "Grace", 0.1],
  ["Chart labels overlap on small screens", "/dashboard", "Dashboard", [], "Linus", 0.5],
  ["Typo in the onboarding email step", "/onboarding", "Onboarding", [], null, 3],
  ["Export to CSV times out for large teams", "/reports", "Reports", ["Error: 504 Gateway Timeout"], "Margaret", 26],
  ["Dark mode toggle resets after refresh", "/settings", "Settings", [], "Alan", 50],
  ["Search ignores accented characters", "/search", "Search", [], "Barbara", 75],
];

async function seed() {
  // the same rule as reset-e2e-db.ts: only an e2e database (brainbox_e2e_<checkout>)
  if (!/(^|_)e2e(_|$)/.test(new URL(env.DATABASE_URL).pathname.slice(1))) {
    throw new Error("seed-e2e-triage seeds only an e2e database");
  }
  const store = getStore();
  const adapter = store.authAdapter();
  if (!adapter.createUser) throw new Error("auth adapter cannot create users");
  const user = await adapter.createUser({
    id: crypto.randomUUID(),
    email: TRIAGE_EMAIL,
    emailVerified: null,
    name: "Ada Lovelace",
  });
  const team = await store.teams.create({ name: "Acme", ownerId: user.id });
  const project = await store.projects.create({
    teamId: team.id,
    name: "Acme Web",
    key: generateProjectKey(),
    allowedOrigins: [],
  });

  const ids: string[] = [];
  for (const [text, path, title, consoleErrors, reporter, hoursAgo] of REPORTS) {
    const id = crypto.randomUUID();
    ids.push(id);
    await store.issues.create({
      id,
      projectId: project.id,
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
      text,
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
      metadata: {
        url: `https://app.acme.test${path}`,
        title,
        viewport: { width: 1440, height: 900 },
        devicePixelRatio: 2,
        userAgent: "Mozilla/5.0",
        language: "en",
        timezone: "UTC",
        consoleErrors,
        ...(reporter && { identity: { name: reporter, email: `${reporter.toLowerCase()}@customer.test` } }),
      },
    });
  }
  // The older three are already triaged; the newest three wait in the Inbox.
  const [, , , csv, darkMode, search] = ids;
  if (!csv || !darkMode || !search) throw new Error("seed lost a report");
  await store.issues.triage([csv], { status: "in_progress", priority: "high" }, user.id);
  await store.issues.triage([darkMode], { status: "open", priority: "low" }, user.id);
  await store.issues.triage([search], { status: "resolved" }, user.id);

  console.log(JSON.stringify({ projectId: project.id, email: TRIAGE_EMAIL }));
  process.exit(0);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
