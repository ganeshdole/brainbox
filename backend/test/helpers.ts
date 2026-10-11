import { encode } from "@auth/core/jwt";
import type { BillingPeriod, PlanId, SubscriptionStatus } from "@brainbox/shared";

import { db } from "../src/db/client.ts";
import {
  integrationConnections,
  issues,
  projectDestinations,
  projects,
  subscriptions,
  users,
} from "../src/db/schema/index.ts";
import { generateProjectKey } from "../src/lib/projectKey.ts";
import { testEnv } from "./env.ts";

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
  const [u] = await db.insert(users).values({ email, name: "Test" }).returning();
  if (opts.subscribed !== false) await subscribeUser(u!.id);
  return u!;
}

/** Give an Account an active subscription, so it gets past requireSubscription. */
export async function subscribeUser(
  userId: string,
  status: SubscriptionStatus = "active",
  over: { plan?: PlanId; period?: BillingPeriod } = {},
) {
  await db.insert(subscriptions).values({
    userId,
    dodoSubscriptionId: `sub_${Math.random().toString(36).slice(2)}`,
    dodoCustomerId: "cus_test",
    dodoProductId: "pdt_test",
    plan: over.plan ?? "pro",
    period: over.period ?? "monthly",
    status,
  });
}

export async function makeProject(ownerId: string, allowedOrigins: string[] = []) {
  const [p] = await db
    .insert(projects)
    .values({ ownerId, name: "Test Project", key: generateProjectKey(), allowedOrigins })
    .returning();
  return p!;
}

export async function makeIssue(
  projectId: string,
  over: Partial<typeof issues.$inferInsert> = {},
) {
  const [i] = await db
    .insert(issues)
    .values({
      projectId,
      screenshotKey: `${projectId}/issue/screenshot.png`,
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
    })
    .returning();
  return i!;
}

export async function makeConnection(ownerId: string, externalId = "4242", label = "acme") {
  const [c] = await db
    .insert(integrationConnections)
    .values({ ownerId, provider: "github", externalId, label })
    .returning();
  return c!;
}

export async function makeDestination(
  projectId: string,
  connectionId: string,
  over: Partial<typeof projectDestinations.$inferInsert> = {},
) {
  const [d] = await db
    .insert(projectDestinations)
    .values({
      projectId,
      connectionId,
      provider: "github",
      config: { owner: "acme", repo: "web", labels: [] },
      ...over,
    })
    .returning();
  return d!;
}
