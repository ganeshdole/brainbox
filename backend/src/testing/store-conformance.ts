import { beforeEach, describe, expect, it } from "vitest";

import { generateProjectKey } from "../lib/projectKey.ts";
import type { NewIssue, Store, StoreModule, StoreWith } from "../store/types.ts";

// What every Store must do, checked against the store itself rather than
// through HTTP: the core, and each optional module the store has. Postgres,
// Convex and the in-memory store all run it; so can yours:
//
//   import { describeStoreConformance } from "@ganeshdole/brainbox-backend/testing";
//   describeStoreConformance("Mongo", { store: () => mongo, reset: () => mongo.drop() });
//
// The backend's integration tests (test/*.int.test.ts) remain the full
// contract for this repo's stores; this is the part a store of your own can
// run without them.

export interface ConformanceOptions {
  /** The store under test. Called while the suite is collected, to see which
   *  modules it has, and again in every test. */
  store: () => Store;
  /** Empties the store; runs before every test when given. Without it, the
   *  suite only ever reads back what each test wrote. */
  reset?: () => Promise<void>;
}

/** Registers the conformance tests for one store (vitest). */
export function describeStoreConformance(name: string, options: ConformanceOptions): void {
  const has = (...modules: StoreModule[]) => modules.every((m) => options.store()[m] !== undefined);
  const { reset } = options;

  describe(`${name} store conformance`, () => {
    if (reset) beforeEach(reset);

    describe("projects", () => projectTests(options.store));
    describe("issues", () => issueTests(options.store));
    describe.skipIf(!has("auth"))("auth", () => authTests(options.store as () => StoreWith<"auth">));
    describe.skipIf(!has("auth", "teams"))("teams", () =>
      teamTests(options.store as () => StoreWith<"auth" | "teams">),
    );
    describe.skipIf(!has("triage"))("triage", () => triageTests(options.store as () => StoreWith<"triage">));
    describe.skipIf(!has("features"))("features", () =>
      featureTests(options.store as () => StoreWith<"features">),
    );
    describe.skipIf(!has("integrations"))("integrations", () =>
      integrationTests(options.store as () => StoreWith<"integrations">),
    );
    describe.skipIf(!has("auth", "billing"))("billing", () =>
      billingTests(options.store as () => StoreWith<"auth" | "billing">),
    );
    describe.skipIf(!has("waitlist"))("waitlist", () => waitlistTests(options.store as () => StoreWith<"waitlist">));
  });
}

// --- seeds ---

const unique = () => crypto.randomUUID().slice(0, 8);

/** The value, which a step before has to have produced. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** Stores stamp rows with their own clock; a pause keeps "newest first" from
 *  hanging on a tie. */
const tick = () => new Promise((r) => setTimeout(r, 5));

async function newUser(store: StoreWith<"auth">, email = `u-${unique()}@conformance.test`) {
  const adapter = store.auth.adapter();
  if (!adapter.createUser) throw new Error("the auth adapter cannot create users");
  return adapter.createUser({ id: crypto.randomUUID(), email, emailVerified: null, name: "Conformance" });
}

/** A Team id a project can belong to: a real Team when the store keeps them
 *  (a database may insist), any id otherwise. */
async function newTeamId(store: Store): Promise<string> {
  if (!store.auth || !store.teams) return `team-${unique()}`;
  const owner = await newUser({ ...store, auth: store.auth });
  return (await store.teams.create({ name: "Conformance", ownerId: owner.id })).id;
}

async function newProject(store: Store, teamId?: string) {
  return store.projects.create({
    teamId: teamId ?? (await newTeamId(store)),
    name: "Conformance",
    key: generateProjectKey(),
    allowedOrigins: [],
  });
}

function issueInput(projectId: string, over: Partial<NewIssue> = {}): NewIssue {
  return {
    id: crypto.randomUUID(),
    projectId,
    kind: "bug",
    importance: null,
    text: "broken",
    screenshotKey: `${projectId}/i/screenshot.png`,
    cropKey: null,
    videoKey: null,
    videoMime: null,
    videoTranscriptStatus: null,
    sessionKey: null,
    audioKey: null,
    audioMime: null,
    audioTranscriptStatus: null,
    region: { x: 1, y: 2, width: 3, height: 4 },
    metadata: {
      url: "https://app.example.com/billing",
      title: "Billing",
      viewport: { width: 1280, height: 800 },
      devicePixelRatio: 2,
      userAgent: "Conformance",
      language: "en",
      timezone: "UTC",
      consoleErrors: ["TypeError: x is undefined"],
      identity: { id: "u1", email: "ada@example.com" },
    },
    ...over,
  };
}

async function newIssue(store: Store, projectId: string, over: Partial<NewIssue> = {}) {
  const input = issueInput(projectId, over);
  await store.issues.create(input);
  const row = await store.issues.get(input.id);
  if (!row) throw new Error("a created issue could not be read back");
  return row;
}

// --- core ---

function projectTests(get: () => Store) {
  it("creates a project and finds it by id and by key", async () => {
    const store = get();
    const teamId = await newTeamId(store);
    const key = generateProjectKey();
    const created = await store.projects.create({ teamId, name: "Shop", key, allowedOrigins: ["https://a.test"] });
    expect(created).toMatchObject({ teamId, name: "Shop", key, allowedOrigins: ["https://a.test"] });
    expect(typeof created.id).toBe("string");
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await store.projects.get(created.id)).toEqual(created);
    expect(await store.projects.getByKey(key)).toEqual(created);
  });

  it("refuses a second project with the same key", async () => {
    const store = get();
    const project = await newProject(store);
    await expect(
      store.projects.create({ teamId: project.teamId, name: "Copy", key: project.key, allowedOrigins: [] }),
    ).rejects.toThrow();
    expect((await store.projects.getByKey(project.key))?.id).toBe(project.id);
  });

  it("keeps its own copy of what it is given", async () => {
    const store = get();
    const origins = ["https://a.test"];
    const project = await store.projects.create({
      teamId: await newTeamId(store),
      name: "Shop",
      key: generateProjectKey(),
      allowedOrigins: origins,
    });
    origins.push("https://evil.test");
    expect((await store.projects.get(project.id))?.allowedOrigins).toEqual(["https://a.test"]);
  });

  it("has nothing for an unknown id or key", async () => {
    const store = get();
    expect(await store.projects.get(crypto.randomUUID())).toBeNull();
    expect(await store.projects.getByKey(generateProjectKey())).toBeNull();
  });

  it("updates the name and origins it is given, and nothing else", async () => {
    const store = get();
    const project = await newProject(store);
    const renamed = await store.projects.update(project.id, { name: "Renamed" });
    expect(renamed).toEqual({ ...project, name: "Renamed" });
    const locked = await store.projects.update(project.id, { allowedOrigins: ["https://b.test"] });
    expect(locked).toEqual({ ...project, name: "Renamed", allowedOrigins: ["https://b.test"] });
    expect(await store.projects.get(project.id)).toEqual(locked);
    expect(await store.projects.update(crypto.randomUUID(), { name: "x" })).toBeNull();
  });

  it("lists a set of Teams' projects newest first, with their counts", async () => {
    const store = get();
    const [teamA, teamB, teamC] = [await newTeamId(store), await newTeamId(store), await newTeamId(store)];
    const older = await newProject(store, teamA);
    await tick();
    const newer = await newProject(store, teamB);
    await newProject(store, teamC);
    await newIssue(store, newer.id);
    await newIssue(store, newer.id, { kind: "feature", importance: "important", screenshotKey: null });

    const rows = await store.projects.listForTeams([teamA, teamB]);
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(rows[0]).toMatchObject({ ...newer, issueCount: 2, featureRequestCount: 1 });
    expect(rows[1]).toMatchObject({ issueCount: 0, featureRequestCount: 0 });
    expect(await store.projects.listForTeams([])).toEqual([]);
  });

  it("deletes a project with its issues", async () => {
    const store = get();
    const project = await newProject(store);
    const issue = await newIssue(store, project.id);
    await store.projects.delete(project.id);
    expect(await store.projects.get(project.id)).toBeNull();
    expect(await store.projects.getByKey(project.key)).toBeNull();
    expect(await store.issues.get(issue.id)).toBeNull();
  });
}

function issueTests(get: () => Store) {
  it("stores an issue under the id the caller picks, exactly as given", async () => {
    const store = get();
    const project = await newProject(store);
    const input = issueInput(project.id, { audioKey: "a.webm", audioMime: "audio/webm", audioTranscriptStatus: "pending" });
    await store.issues.create(input);
    const row = await store.issues.get(input.id);
    const { createdAt: _createdAt, ...given } = input;
    expect(row).toMatchObject(given);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("starts every issue untriaged, unsorted and untranscribed", async () => {
    const store = get();
    const project = await newProject(store);
    const row = await newIssue(store, project.id);
    expect(row).toMatchObject({
      status: "new",
      priority: "none",
      closeReason: null,
      statusChangedAt: null,
      featureId: null,
      audioTranscript: null,
      videoTranscript: null,
    });
  });

  it("keeps a feature request's importance", async () => {
    const store = get();
    const project = await newProject(store);
    const row = await newIssue(store, project.id, { kind: "feature", importance: "critical", screenshotKey: null });
    expect(row).toMatchObject({ kind: "feature", importance: "critical", screenshotKey: null });
  });

  it("keeps an imported issue's createdAt", async () => {
    const store = get();
    const project = await newProject(store);
    const at = new Date("2026-01-02T03:04:05.000Z");
    expect((await newIssue(store, project.id, { createdAt: at })).createdAt.toISOString()).toBe(at.toISOString());
  });

  it("lists a project's issues newest first, and only its own", async () => {
    const store = get();
    const project = await newProject(store);
    const other = await newProject(store);
    const old = await newIssue(store, project.id, { createdAt: new Date("2026-01-01T00:00:00Z") });
    const recent = await newIssue(store, project.id, { createdAt: new Date("2026-03-01T00:00:00Z") });
    const middle = await newIssue(store, project.id, { createdAt: new Date("2026-02-01T00:00:00Z") });
    await newIssue(store, other.id);
    const rows = await store.issues.listForProject(project.id);
    expect(rows.map((r) => r.id)).toEqual([recent.id, middle.id, old.id]);
    expect(rows[0]).toEqual(recent);
  });

  it("has nothing for an unknown id", async () => {
    expect(await get().issues.get(crypto.randomUUID())).toBeNull();
  });

  it("refuses an issue for a project it doesn't have", async () => {
    const store = get();
    const input = issueInput(crypto.randomUUID());
    await expect(store.issues.create(input)).rejects.toThrow();
    expect(await store.issues.get(input.id)).toBeNull();
  });

  it("records a transcript, or that it failed, on the audio or the video", async () => {
    const store = get();
    const project = await newProject(store);
    const issue = await newIssue(store, project.id, {
      audioKey: "a.webm",
      audioMime: "audio/webm",
      audioTranscriptStatus: "pending",
      videoKey: "r.webm",
      videoMime: "video/webm",
      videoTranscriptStatus: "pending",
    });
    await store.issues.setTranscript(issue.id, "audio", { status: "done", text: "it crashes" });
    await store.issues.setTranscript(issue.id, "video", { status: "failed" });
    expect(await store.issues.get(issue.id)).toMatchObject({
      audioTranscriptStatus: "done",
      audioTranscript: "it crashes",
      videoTranscriptStatus: "failed",
      videoTranscript: null,
    });
  });
}

// --- modules ---

function authTests(get: () => StoreWith<"auth">) {
  it("keeps users for Auth.js", async () => {
    const store = get();
    const email = `ada-${unique()}@conformance.test`;
    const user = await newUser(store, email);
    const adapter = store.auth.adapter();
    expect(await adapter.getUser?.(user.id)).toMatchObject({ id: user.id, email });
    expect(await adapter.getUserByEmail?.(email)).toMatchObject({ id: user.id });
  });

  it("counts attempts at a pending code, and nothing without one", async () => {
    const { auth } = get();
    const email = `code-${unique()}@conformance.test`;
    const now = Date.now();
    const at = (s: number) => ({ at: new Date(now + s * 1000), since: new Date(now - 60_000), keep: 3 });

    expect(await auth.recordAttempt(email, at(0))).toBe(0);
    await auth.replaceCode({ identifier: email, token: "hash-1", expires: new Date(now + 600_000) });
    expect(await auth.recordAttempt(email, at(1))).toBe(1);
    expect(await auth.recordAttempt(email, at(2))).toBe(2);
    // A new code replaces the old one but buys no fresh attempts.
    await auth.replaceCode({ identifier: email, token: "hash-2", expires: new Date(now + 600_000) });
    expect(await auth.recordAttempt(email, at(3))).toBe(3);
    await auth.forgetAttempts(email);
    expect(await auth.recordAttempt(email, at(4))).toBe(1);
    await auth.revokeCodes(email);
    expect(await auth.recordAttempt(email, at(5))).toBe(0);
  });

  it("only counts attempts since the window opened", async () => {
    const { auth } = get();
    const email = `window-${unique()}@conformance.test`;
    const now = Date.now();
    await auth.replaceCode({ identifier: email, token: "hash", expires: new Date(now + 600_000) });
    await auth.recordAttempt(email, { at: new Date(now - 120_000), since: new Date(now - 600_000), keep: 5 });
    expect(await auth.recordAttempt(email, { at: new Date(now), since: new Date(now - 60_000), keep: 5 })).toBe(1);
  });
}

function teamTests(get: () => StoreWith<"auth" | "teams">) {
  it("creates a Team with its Owner, and lists it for them", async () => {
    const store = get();
    const owner = await newUser(store);
    const team = await store.teams.create({ name: "Acme", ownerId: owner.id });
    expect(team).toMatchObject({ name: "Acme" });
    expect(await store.teams.get(team.id)).toEqual(team);
    expect(await store.teams.listForUser(owner.id)).toEqual([{ ...team, role: "owner" }]);
    expect(await store.teams.membership(team.id, owner.id)).toMatchObject({ teamId: team.id, userId: owner.id, role: "owner" });
    const [member] = await store.teams.members(team.id);
    expect(member).toMatchObject({ userId: owner.id, role: "owner", email: owner.email });
    expect((await store.teams.rename(team.id, "Acme Inc"))?.name).toBe("Acme Inc");
  });

  it("never leaves a Team without an Owner", async () => {
    const store = get();
    const owner = await newUser(store);
    const team = await store.teams.create({ name: "Acme", ownerId: owner.id });
    expect(await store.teams.setRole(team.id, owner.id, "admin")).toBe("last_owner");
    expect(await store.teams.removeMember(team.id, owner.id)).toBe("last_owner");
    expect(await store.teams.setRole(team.id, crypto.randomUUID(), "admin")).toBe("not_found");
    expect(await store.teams.membership(team.id, owner.id)).toMatchObject({ role: "owner" });
  });

  it("replaces an open invite to the same address, and accepts it once", async () => {
    const store = get();
    const owner = await newUser(store);
    const team = await store.teams.create({ name: "Acme", ownerId: owner.id });
    const email = `new-${unique()}@conformance.test`;
    const expiresAt = new Date(Date.now() + 60_000);
    const first = await store.teams.createInvite({ teamId: team.id, email, role: "member", invitedBy: owner.id, expiresAt });
    const second = await store.teams.createInvite({ teamId: team.id, email, role: "admin", invitedBy: owner.id, expiresAt });
    expect(second.id).not.toBe(first.id);
    expect(await store.teams.getInvite(first.id)).toBeNull();
    expect((await store.teams.listInvites(team.id)).map((i) => i.id)).toEqual([second.id]);
    expect((await store.teams.invitesForEmail(email)).map((i) => i.id)).toEqual([second.id]);

    const joiner = await newUser(store, email);
    expect(await store.teams.acceptInvite(second.id, joiner.id, new Date())).toEqual({ status: "accepted", teamId: team.id });
    expect(await store.teams.membership(team.id, joiner.id)).toMatchObject({ role: "admin" });
    expect(await store.teams.acceptInvite(second.id, joiner.id, new Date())).toEqual({ status: "not_found" });
  });

  it("refuses an expired invite, and revokes one", async () => {
    const store = get();
    const owner = await newUser(store);
    const team = await store.teams.create({ name: "Acme", ownerId: owner.id });
    const late = await store.teams.createInvite({
      teamId: team.id,
      email: `late-${unique()}@conformance.test`,
      role: "member",
      invitedBy: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    const joiner = await newUser(store);
    expect(await store.teams.acceptInvite(late.id, joiner.id, new Date())).toEqual({ status: "expired" });
    await store.teams.revokeInvite(team.id, late.id);
    expect(await store.teams.getInvite(late.id)).toBeNull();
  });

  it("lets a member leave, and keeps an existing member's role on a new invite", async () => {
    const store = get();
    const owner = await newUser(store);
    const team = await store.teams.create({ name: "Acme", ownerId: owner.id });
    const admin = await newUser(store);
    const invite = await store.teams.createInvite({
      teamId: team.id,
      email: admin.email,
      role: "admin",
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await store.teams.acceptInvite(invite.id, admin.id, new Date());
    const again = await store.teams.createInvite({
      teamId: team.id,
      email: admin.email,
      role: "member",
      invitedBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await store.teams.acceptInvite(again.id, admin.id, new Date());
    expect(await store.teams.membership(team.id, admin.id)).toMatchObject({ role: "admin" });
    expect(await store.teams.removeMember(team.id, admin.id)).toBe("done");
    expect(await store.teams.listForUser(admin.id)).toEqual([]);
  });
}

function triageTests(get: () => StoreWith<"triage">) {
  it("changes status and priority, and logs each change", async () => {
    const store = get();
    const project = await newProject(store);
    const issue = await newIssue(store, project.id);
    const [row] = await store.triage.apply([issue.id], { status: "in_progress", priority: "high" }, null);
    expect(row).toMatchObject({ id: issue.id, status: "in_progress", priority: "high", closeReason: null });
    expect(row?.statusChangedAt).toBeInstanceOf(Date);
    expect(await store.issues.get(issue.id)).toMatchObject({ status: "in_progress", priority: "high" });
    const events = await store.triage.listEvents(issue.id);
    expect(events.map((e) => [e.kind, e.from, e.to])).toEqual([
      ["status", "new", "in_progress"],
      ["priority", "none", "high"],
    ]);
    expect(events[0]).toMatchObject({ issueId: issue.id, actorId: null });
  });

  it("writes no event for a change to what it already is", async () => {
    const store = get();
    const project = await newProject(store);
    const issue = await newIssue(store, project.id);
    await store.triage.apply([issue.id], { priority: "none" }, null);
    expect(await store.triage.listEvents(issue.id)).toEqual([]);
  });

  it("writes all of a bulk change or none of it", async () => {
    const store = get();
    const project = await newProject(store);
    const closed = await newIssue(store, project.id);
    const open = await newIssue(store, project.id);
    await store.triage.apply([closed.id], { status: "closed", closeReason: "duplicate" }, null);
    // A close reason is only for closed issues: `open` refuses it, so neither changes.
    await expect(store.triage.apply([closed.id, open.id], { closeReason: "spam" }, null)).rejects.toThrow();
    expect(await store.issues.get(closed.id)).toMatchObject({ closeReason: "duplicate" });
    expect(await store.triage.listEvents(open.id)).toEqual([]);
  });

  it("clears the close reason when an issue is reopened", async () => {
    const store = get();
    const project = await newProject(store);
    const issue = await newIssue(store, project.id);
    await store.triage.apply([issue.id], { status: "closed", closeReason: "wont_fix" }, null);
    const [row] = await store.triage.apply([issue.id], { status: "open" }, null);
    expect(row).toMatchObject({ status: "open", closeReason: null });
  });

  it("changes nothing for no ids", async () => {
    expect(await get().triage.apply([], { status: "open" }, null)).toEqual([]);
  });
}

function featureTests(get: () => StoreWith<"features">) {
  it("creates a feature under review, and counts the requests attached", async () => {
    const store = get();
    const project = await newProject(store);
    const feature = await store.features.create({ projectId: project.id, title: "Dark mode", description: null });
    expect(feature).toMatchObject({ projectId: project.id, title: "Dark mode", description: null, status: "under_review" });
    expect(await store.features.get(feature.id)).toEqual(feature);
    const request = await newIssue(store, project.id, { kind: "feature", screenshotKey: null });
    await store.features.attach(request.id, feature.id);
    expect((await store.issues.get(request.id))?.featureId).toBe(feature.id);
    const [listed] = await store.features.listForProject(project.id);
    expect(listed).toMatchObject({ id: feature.id, requestCount: 1 });
    await store.features.attach(request.id, null);
    expect((await store.issues.get(request.id))?.featureId).toBeNull();
  });

  it("updates what it is given", async () => {
    const store = get();
    const project = await newProject(store);
    const feature = await store.features.create({ projectId: project.id, title: "A", description: "x", status: "planned" });
    const updated = await store.features.update(feature.id, { status: "shipped", description: null });
    expect(updated).toMatchObject({ title: "A", description: null, status: "shipped" });
    expect(await store.features.update(crypto.randomUUID(), { title: "x" })).toBeNull();
  });

  it("merges one feature into another, requests and all", async () => {
    const store = get();
    const project = await newProject(store);
    const from = await store.features.create({ projectId: project.id, title: "Dark", description: null });
    const into = await store.features.create({ projectId: project.id, title: "Dark mode", description: null });
    const request = await newIssue(store, project.id, { kind: "feature", screenshotKey: null });
    await store.features.attach(request.id, from.id);
    await store.features.merge(from.id, into.id);
    expect(await store.features.get(from.id)).toBeNull();
    expect((await store.issues.get(request.id))?.featureId).toBe(into.id);
  });

  it("sends a deleted feature's requests back to waiting", async () => {
    const store = get();
    const project = await newProject(store);
    const feature = await store.features.create({ projectId: project.id, title: "Dark mode", description: null });
    const request = await newIssue(store, project.id, { kind: "feature", screenshotKey: null });
    await store.features.attach(request.id, feature.id);
    await store.features.delete(feature.id);
    expect(await store.features.get(feature.id)).toBeNull();
    expect((await store.issues.get(request.id))?.featureId).toBeNull();
  });
}

function integrationTests(get: () => StoreWith<"integrations">) {
  async function connected(store: StoreWith<"integrations">) {
    const teamId = await newTeamId(store);
    const conn = await store.integrations.saveConnection({
      teamId,
      provider: "github",
      externalId: `inst-${unique()}`,
      label: "acme",
      auth: "app",
      credentials: null,
    });
    const project = await newProject(store, teamId);
    return { teamId, conn, project };
  }

  it("saves a connection active, and saving again reconnects it", async () => {
    const store = get();
    const { teamId, conn } = await connected(store);
    expect(conn).toMatchObject({ teamId, provider: "github", status: "active", credentials: null });
    await store.integrations.setConnectionStatus(conn.id, "needs_reauth");
    expect((await store.integrations.getConnection(conn.id))?.status).toBe("needs_reauth");
    const { teamId: team, provider, externalId, auth, credentials } = conn;
    const again = await store.integrations.saveConnection({ teamId: team, provider, externalId, auth, credentials, label: "acme-inc" });
    expect(again).toMatchObject({ id: conn.id, label: "acme-inc", status: "active" });
    expect((await store.integrations.listConnections(teamId)).map((c) => c.id)).toEqual([conn.id]);
  });

  it("keeps one destination per project and provider, paused ones only on request", async () => {
    const store = get();
    const { conn, project } = await connected(store);
    const config = { owner: "acme", repo: "web", labels: [] };
    await store.integrations.saveDestination({ projectId: project.id, connectionId: conn.id, provider: "github", config, enabled: true });
    const paused = await store.integrations.saveDestination({
      projectId: project.id,
      connectionId: conn.id,
      provider: "github",
      config: { ...config, repo: "app" },
      enabled: false,
    });
    expect(await store.integrations.listDestinations(project.id)).toEqual([paused]);
    expect(await store.integrations.deliveryTargets(project.id, { includePaused: false })).toEqual([]);
    const [target] = await store.integrations.deliveryTargets(project.id, { includePaused: true });
    expect(target?.destination).toEqual(paused);
    expect(target?.connection.id).toBe(conn.id);
    await store.integrations.deleteDestination(project.id, "github");
    expect(await store.integrations.listDestinations(project.id)).toEqual([]);
  });

  it("claims a delivery once, unless retrying, and records its outcome", async () => {
    const store = get();
    const { conn, project } = await connected(store);
    const dest = await store.integrations.saveDestination({
      projectId: project.id,
      connectionId: conn.id,
      provider: "github",
      config: { owner: "acme", repo: "web", labels: [] },
      enabled: true,
    });
    const issue = await newIssue(store, project.id);
    const claim = { issueId: issue.id, destinationId: dest.id, provider: "github" as const };
    const row = await store.integrations.claimDelivery({ ...claim, retry: false });
    expect(row).toMatchObject({ status: "pending", attempts: 0 });
    expect(await store.integrations.claimDelivery({ ...claim, retry: false })).toBeNull();

    const sent = await store.integrations.finishDelivery(must(row).id, { ok: true, externalId: "42", url: "https://gh/42" });
    expect(sent).toMatchObject({ status: "sent", externalId: "42", externalUrl: "https://gh/42", attempts: 1 });
    const failed = await store.integrations.finishDelivery(must(row).id, { ok: false, error: "down" });
    expect(failed).toMatchObject({ status: "failed", error: "down", externalUrl: "https://gh/42", attempts: 2 });
    expect(await store.integrations.listDeliveries(issue.id)).toEqual([failed]);
    expect(await store.integrations.claimDelivery({ ...claim, retry: true })).toMatchObject({ id: must(row).id, status: "pending" });
  });

  it("removes a connection with its destinations, keeping their deliveries' links", async () => {
    const store = get();
    const { conn, project } = await connected(store);
    const dest = await store.integrations.saveDestination({
      projectId: project.id,
      connectionId: conn.id,
      provider: "github",
      config: { owner: "acme", repo: "web", labels: [] },
      enabled: true,
    });
    const issue = await newIssue(store, project.id);
    const row = await store.integrations.claimDelivery({ issueId: issue.id, destinationId: dest.id, provider: "github", retry: false });
    await store.integrations.finishDelivery(must(row).id, { ok: true, externalId: "1", url: "https://gh/1" });
    await store.integrations.deleteConnection(conn.id);
    expect(await store.integrations.getConnection(conn.id)).toBeNull();
    expect(await store.integrations.listDestinations(project.id)).toEqual([]);
    expect(await store.integrations.listDeliveries(issue.id)).toMatchObject([{ destinationId: null, externalUrl: "https://gh/1" }]);
  });

  it("applies a GitHub uninstall once", async () => {
    const store = get();
    const { conn } = await connected(store);
    const event = { eventId: `gh-${unique()}`, eventType: "installation.deleted", removedInstallation: conn.externalId };
    expect(await store.integrations.applyGithubEvent(event)).toBe("applied");
    expect(await store.integrations.getConnection(conn.id)).toBeNull();
    expect(await store.integrations.applyGithubEvent(event)).toBe("duplicate");
  });
}

function billingTests(get: () => StoreWith<"auth" | "billing">) {
  it("records a subscription from its first event, once", async () => {
    const store = get();
    const user = await newUser(store);
    const event = {
      eventId: `evt-${unique()}`,
      eventType: "subscription.active",
      change: {
        dodoSubscriptionId: `sub-${unique()}`,
        status: "active" as const,
        currentPeriodEnd: null,
        sentAt: new Date(),
        create: { userId: user.id, dodoCustomerId: "cus", dodoProductId: "pdt", plan: "pro" as const, period: "monthly" as const },
      },
    };
    expect(await store.billing.subscriptionFor(user.id)).toBeNull();
    expect(await store.billing.applySubscriptionEvent(event)).toBe("applied");
    expect(await store.billing.subscriptionFor(user.id)).toMatchObject({ userId: user.id, status: "active", plan: "pro" });
    expect(await store.billing.applySubscriptionEvent(event)).toBe("duplicate");
  });

  it("ignores an event older than the state it has", async () => {
    const store = get();
    const user = await newUser(store);
    const dodoSubscriptionId = `sub-${unique()}`;
    const create = { userId: user.id, dodoCustomerId: "cus", dodoProductId: "pdt", plan: "pro" as const, period: "monthly" as const };
    const at = (s: number) => new Date(Date.now() + s * 1000);
    const change = (status: "active" | "on_hold", sentAt: Date) => ({
      eventId: `evt-${unique()}`,
      eventType: `subscription.${status}`,
      change: { dodoSubscriptionId, status, currentPeriodEnd: null, sentAt, create },
    });
    await store.billing.applySubscriptionEvent(change("active", at(10)));
    await store.billing.applySubscriptionEvent(change("on_hold", at(0)));
    expect((await store.billing.subscriptionFor(user.id))?.status).toBe("active");
  });
}

function waitlistTests(get: () => StoreWith<"waitlist">) {
  it("adds an address once", async () => {
    const store = get();
    const email = `wait-${unique()}@conformance.test`;
    const row = await store.waitlist.add(email, "conformance");
    expect(row).toMatchObject({ email, source: "conformance", emailStatus: "pending", emailError: null });
    expect(await store.waitlist.add(email, "conformance")).toBeNull();
    await store.waitlist.setEmailStatus(must(row).id, { status: "failed", error: "bounced" });
  });
}
