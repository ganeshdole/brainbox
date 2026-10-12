import { sql } from "drizzle-orm";

import { api } from "../convex/_generated/api.js";
import { getConvex } from "../src/convex-client.ts";
import { getDb } from "../src/db/client.ts";
import { integrationConnections, projectDestinations, waitlistSignups, webhookEvents } from "../src/db/schema/index.ts";
import { env } from "../src/env.ts";
import { fromConvex } from "../src/store/convex.ts";
import {
  getStore,
  type ConnectionRecord,
  type DestinationRecord,
  type WaitlistSignupRecord,
} from "../src/store/index.ts";

// The integration suite runs against whichever store TEST_STORE picks
// (test/env.ts). Tests seed through helpers.ts and inspect through `stored`,
// never through one database's client, so every store passes the same suite.

/** What only a test needs: a clean slate, and whole tables the Store has no
 *  reason to list. */
interface StoreInspector {
  reset(): Promise<void>;
  connections(): Promise<ConnectionRecord[]>;
  destinations(): Promise<DestinationRecord[]>;
  webhookEvents(): Promise<Array<{ id: string; type: string }>>;
  waitlistSignups(): Promise<WaitlistSignupRecord[]>;
}

const postgres: StoreInspector = {
  async reset() {
    await getDb().execute(
      sql.raw(
        `truncate table sign_in_attempts, waitlist_signups, webhook_events, subscriptions, deliveries, project_destinations, integration_connections, issues, projects, accounts, sessions, "verificationTokens", users restart identity cascade`,
      ),
    );
  },
  connections: () => getDb().select().from(integrationConnections),
  destinations: () => getDb().select().from(projectDestinations),
  webhookEvents: () => getDb().select({ id: webhookEvents.id, type: webhookEvents.type }).from(webhookEvents),
  waitlistSignups: () => getDb().select().from(waitlistSignups),
};

const convex: StoreInspector = {
  async reset() {
    await getConvex().mutation(api.testing.reset, {});
  },
  async connections() {
    return (await getConvex().query(api.testing.connections, {})).map(fromConvex.connection);
  },
  async destinations() {
    return (await getConvex().query(api.testing.destinations, {})).map(fromConvex.destination);
  },
  async webhookEvents() {
    return (await getConvex().query(api.testing.webhookEvents, {})).map(({ id, type }) => ({ id, type }));
  },
  async waitlistSignups() {
    return (await getConvex().query(api.testing.waitlistSignups, {})).map(fromConvex.waitlistSignup);
  },
};

const inspector = env.DATABASE_DRIVER === "convex" ? convex : postgres;

/** Empties the store; runs before every test (setup.ts). */
export const resetStore = (): Promise<void> => inspector.reset();

const list = <T>(row: T | null): T[] => (row ? [row] : []);

/** What the store holds, as tests assert on it: arrays, like the queries they replaced. */
export const stored = {
  issues: async (id: string) => list(await getStore().issues.get(id)),
  deliveries: (issueId: string) => getStore().integrations.listDeliveries(issueId),
  subscriptions: async (userId: string) => list(await getStore().billing.subscriptionFor(userId)),
  connections: async (ownerId?: string) =>
    (await inspector.connections()).filter((c) => ownerId === undefined || c.ownerId === ownerId),
  destinations: () => inspector.destinations(),
  webhookEvents: async (id: string) => (await inspector.webhookEvents()).filter((e) => e.id === id),
  waitlistSignups: () => inspector.waitlistSignups(),
};
