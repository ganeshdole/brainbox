import { encode } from "@auth/core/jwt";
import type { BillingPeriod, PlanId, SubscriptionStatus, TeamRole } from "@ganeshdole/brainbox-shared";

import { generateProjectKey } from "../src/lib/projectKey.ts";
import { getStore, type DestinationRecord, type NewIssue } from "../src/store/index.ts";
import { testEnv } from "./env.ts";

// Seed data through the Store, so the same tests run against every store.

// Auth.js jwt session cookie name on http/localhost (no __Secure- prefix).
const COOKIE_NAME = "authjs.session-token";

/** Mint a real Auth.js session cookie so verifyAuth() resolves this user.
 *  `email` matters for anything that keys off the address (billing exemptions). */
export async function authCookie(
  userId: string,
  email = "test@local",
): Promise<string> {
  const token = await encode({
    salt: COOKIE_NAME,
    secret: testEnv.AUTH_SECRET!,
    token: { sub: userId, name: "Test User", email },
  });
  return `${COOKIE_NAME}=${token}`;
}

/**
 * A customer. Comes with an active subscription by default, because since the
 * paywall landed that is what an ordinary user of this product is - without one
 * every route past /api/me answers 402 and the test would be asserting against
 * the paywall rather than the behaviour it means to cover.
 *
 * Pass `{ subscribed: false }` for the billing tests, which are the ones that
 * care about the unpaid state.
 */
export async function makeUser(
  email = `u-${Math.random().toString(36).slice(2)}@test.local`,
  opts: { subscribed?: boolean } = {},
) {
  const adapter = getStore().authAdapter();
  const user = await adapter.createUser!({ id: crypto.randomUUID(), email, emailVerified: null, name: "Test" });
  if (opts.subscribed !== false) await subscribeUser(user.id);
  return user;
}

/** Give an Account an active subscription, so it gets past requireSubscription.
 *  Seeded as the checkout webhook would record it. */
export async function subscribeUser(
  userId: string,
  status: SubscriptionStatus = "active",
  over: { plan?: PlanId; period?: BillingPeriod } = {},
) {
  await getStore().webhooks.applySubscriptionEvent({
    eventId: `seed_${crypto.randomUUID()}`,
    eventType: "test.seed",
    change: {
      dodoSubscriptionId: `sub_${Math.random().toString(36).slice(2)}`,
      status,
      currentPeriodEnd: null,
      sentAt: new Date(0),
      create: {
        userId,
        dodoCustomerId: "cus_test",
        dodoProductId: "pdt_test",
        plan: over.plan ?? "pro",
        period: over.period ?? "monthly",
      },
    },
  });
}

/** A Team with `ownerId` as its Owner. */
export async function makeTeam(ownerId: string, name = "Test Team") {
  return getStore().teams.create({ name, ownerId });
}

/** The Team `userId` owns, made on first use: what a user's first project
 *  creates through the API. */
export async function teamOf(userId: string): Promise<string> {
  const owned = (await getStore().teams.listForUser(userId)).find((t) => t.role === "owner");
  return owned?.id ?? (await makeTeam(userId)).id;
}

/** Puts `userId` in the Team with `role`. */
export async function addMember(teamId: string, userId: string, role: TeamRole = "member") {
  const store = getStore();
  const user = (await store.authAdapter().getUser!(userId))!;
  const invite = await store.teams.createInvite({
    teamId,
    email: user.email,
    role: role === "owner" ? "admin" : role,
    invitedBy: null,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await store.teams.acceptInvite(invite.id, userId, new Date());
  if (role === "owner") await store.teams.setRole(teamId, userId, "owner");
}

/** A project in the Team `userId` owns (see teamOf). */
export async function makeProject(userId: string, allowedOrigins: string[] = []) {
  return makeTeamProject(await teamOf(userId), allowedOrigins);
}

export async function makeTeamProject(teamId: string, allowedOrigins: string[] = []) {
  return getStore().projects.create({ teamId, name: "Test Project", key: generateProjectKey(), allowedOrigins });
}

export async function makeIssue(projectId: string, over: Partial<NewIssue> = {}) {
  const id = over.id ?? crypto.randomUUID();
  await getStore().issues.create({
    projectId,
    text: null,
    screenshotKey: `${projectId}/issue/screenshot.png`,
    cropKey: null,
    videoKey: null,
    videoMime: null,
    videoTranscriptStatus: null,
    sessionKey: null,
    audioKey: null,
    audioMime: null,
    audioTranscriptStatus: null,
    region: { x: 0, y: 0, width: 10, height: 10 },
    metadata: {
      url: "http://host/app",
      title: "App",
      viewport: { width: 1, height: 1 },
      devicePixelRatio: 1,
      userAgent: "x",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
    },
    ...over,
    id,
  });
  return (await getStore().issues.get(id))!;
}

/** A connection for the Team `userId` owns (see teamOf). */
export async function makeConnection(userId: string, externalId = "4242", label = "acme") {
  const store = getStore();
  const teamId = await teamOf(userId);
  await store.integrations.saveConnection({ teamId, provider: "github", externalId, label });
  const connections = await store.integrations.listConnections(teamId);
  return connections.find((c) => c.provider === "github" && c.externalId === externalId)!;
}

export async function makeDestination(
  projectId: string,
  connectionId: string,
  over: Partial<Pick<DestinationRecord, "config" | "enabled">> = {},
) {
  return getStore().integrations.saveDestination({
    projectId,
    connectionId,
    provider: "github",
    config: { owner: "acme", repo: "web", labels: [] },
    enabled: true,
    ...over,
  });
}
