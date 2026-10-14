import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";

import type { DB } from "../db/client.ts";
import {
  accounts,
  deliveries,
  features,
  integrationConnections,
  issues,
  projectDestinations,
  projects,
  sessions,
  signInAttempts,
  subscriptions,
  users,
  verificationTokens,
  waitlistSignups,
  webhookEvents,
} from "../db/schema/index.ts";
import { planSubscriptionWrite } from "./subscription-write.ts";
import type { Store } from "./types.ts";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** The Postgres store: Drizzle over postgres.js. Foreign keys do the cascades
 *  the `Store` contract describes. */
export function createPostgresStore(db: DB): Store {
  // Locks this email's sign-in row for the rest of the transaction, creating
  // it first. Code requests and attempts for one email take turns on it.
  async function lockSignIn(tx: Tx, identifier: string): Promise<Date[]> {
    await tx.insert(signInAttempts).values({ identifier, attemptedAt: [] }).onConflictDoNothing();
    const [row] = await tx
      .select({ attemptedAt: signInAttempts.attemptedAt })
      .from(signInAttempts)
      .where(eq(signInAttempts.identifier, identifier))
      .for("update");
    return row?.attemptedAt ?? [];
  }

  // Records the event id; false when it was already recorded.
  async function claimEvent(tx: Tx, id: string, type: string): Promise<boolean> {
    const claimed = await tx
      .insert(webhookEvents)
      .values({ id, type })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    return claimed.length > 0;
  }

  return {
    projects: {
      async listForOwner(ownerId) {
        const rows = await db
          .select({
            project: projects,
            issueCount: count(issues.id),
            featureRequestCount: sql<number>`count(*) filter (where ${issues.kind} = 'feature')`.mapWith(Number),
          })
          .from(projects)
          .leftJoin(issues, eq(issues.projectId, projects.id))
          .where(eq(projects.ownerId, ownerId))
          .groupBy(projects.id)
          .orderBy(desc(projects.createdAt));
        return rows.map((r) => ({
          ...r.project,
          issueCount: r.issueCount,
          featureRequestCount: r.featureRequestCount,
        }));
      },
      async create(input) {
        const [row] = await db.insert(projects).values(input).returning();
        if (!row) throw new Error("project insert returned no row");
        return row;
      },
      async get(id) {
        const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        return row ?? null;
      },
      async getByKey(key) {
        const [row] = await db.select().from(projects).where(eq(projects.key, key)).limit(1);
        return row ?? null;
      },
      async update(id, patch) {
        const [row] = await db
          .update(projects)
          .set({
            ...(patch.name !== undefined && { name: patch.name }),
            ...(patch.allowedOrigins !== undefined && { allowedOrigins: patch.allowedOrigins }),
          })
          .where(eq(projects.id, id))
          .returning();
        return row ?? null;
      },
      async delete(id) {
        await db.delete(projects).where(eq(projects.id, id));
      },
    },

    issues: {
      async listForProject(projectId) {
        return db
          .select()
          .from(issues)
          .where(eq(issues.projectId, projectId))
          .orderBy(desc(issues.createdAt));
      },
      async get(id) {
        const [row] = await db.select().from(issues).where(eq(issues.id, id)).limit(1);
        return row ?? null;
      },
      async create(input) {
        await db.insert(issues).values(input);
      },
      async setTranscript(id, kind, outcome) {
        const text = outcome.status === "done" ? outcome.text : undefined;
        await db
          .update(issues)
          .set(
            kind === "audio"
              ? { audioTranscriptStatus: outcome.status, ...(text !== undefined && { audioTranscript: text }) }
              : { videoTranscriptStatus: outcome.status, ...(text !== undefined && { videoTranscript: text }) },
          )
          .where(eq(issues.id, id));
      },
      async setFeature(id, featureId) {
        await db.update(issues).set({ featureId }).where(eq(issues.id, id));
      },
    },

    features: {
      async listForProject(projectId) {
        const rows = await db
          .select({ feature: features, requestCount: count(issues.id) })
          .from(features)
          .leftJoin(issues, eq(issues.featureId, features.id))
          .where(eq(features.projectId, projectId))
          .groupBy(features.id)
          .orderBy(desc(features.createdAt));
        return rows.map((r) => ({ ...r.feature, requestCount: r.requestCount }));
      },
      async get(id) {
        const [row] = await db.select().from(features).where(eq(features.id, id)).limit(1);
        return row ?? null;
      },
      async create(input) {
        const [row] = await db.insert(features).values(input).returning();
        if (!row) throw new Error("feature insert returned no row");
        return row;
      },
      async update(id, patch) {
        const [row] = await db
          .update(features)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(features.id, id))
          .returning();
        return row ?? null;
      },
      async delete(id) {
        // The foreign key sends its requests back to waiting.
        await db.delete(features).where(eq(features.id, id));
      },
      async merge(fromId, intoId) {
        await db.transaction(async (tx) => {
          await tx.update(issues).set({ featureId: intoId }).where(eq(issues.featureId, fromId));
          await tx.delete(features).where(eq(features.id, fromId));
          await tx.update(features).set({ updatedAt: new Date() }).where(eq(features.id, intoId));
        });
      },
    },

    integrations: {
      async listConnections(ownerId) {
        return db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.ownerId, ownerId))
          .orderBy(desc(integrationConnections.createdAt));
      },
      async getConnection(id) {
        const [row] = await db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.id, id))
          .limit(1);
        return row ?? null;
      },
      async saveConnection(input) {
        await db
          .insert(integrationConnections)
          .values(input)
          .onConflictDoUpdate({
            target: [
              integrationConnections.ownerId,
              integrationConnections.provider,
              integrationConnections.externalId,
            ],
            set: { label: input.label },
          });
      },
      async deleteConnection(id) {
        await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
      },

      async listDestinations(projectId) {
        return db
          .select()
          .from(projectDestinations)
          .where(eq(projectDestinations.projectId, projectId));
      },
      async saveDestination(input) {
        const values = {
          connectionId: input.connectionId,
          config: input.config,
          enabled: input.enabled,
          updatedAt: new Date(),
        };
        const [row] = await db
          .insert(projectDestinations)
          .values({ projectId: input.projectId, provider: input.provider, ...values })
          .onConflictDoUpdate({
            target: [projectDestinations.projectId, projectDestinations.provider],
            set: values,
          })
          .returning();
        if (!row) throw new Error("destination upsert returned no row");
        return row;
      },
      async deleteDestination(projectId, provider) {
        await db
          .delete(projectDestinations)
          .where(
            and(eq(projectDestinations.projectId, projectId), eq(projectDestinations.provider, provider)),
          );
      },
      async deliveryTargets(projectId, { includePaused }) {
        const rows = await db
          .select({ destination: projectDestinations, connection: integrationConnections })
          .from(projectDestinations)
          .innerJoin(
            integrationConnections,
            eq(integrationConnections.id, projectDestinations.connectionId),
          )
          .where(
            includePaused
              ? eq(projectDestinations.projectId, projectId)
              : and(eq(projectDestinations.projectId, projectId), eq(projectDestinations.enabled, true)),
          );
        return rows;
      },

      async listDeliveries(issueId) {
        return db.select().from(deliveries).where(eq(deliveries.issueId, issueId));
      },
      async claimDelivery({ issueId, destinationId, provider, retry }) {
        const claim = db
          .insert(deliveries)
          .values({ issueId, destinationId, provider, status: "pending" });
        const [row] = retry
          ? await claim
              .onConflictDoUpdate({
                target: [deliveries.issueId, deliveries.destinationId],
                set: { status: "pending", error: null, updatedAt: new Date() },
              })
              .returning()
          : await claim.onConflictDoNothing().returning();
        return row ?? null;
      },
      async finishDelivery(id, outcome) {
        const [row] = await db
          .update(deliveries)
          .set({
            status: outcome.ok ? "sent" : "failed",
            ...(outcome.ok && { externalId: outcome.externalId, externalUrl: outcome.url }),
            error: outcome.ok ? null : outcome.error,
            attempts: sql`${deliveries.attempts} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(deliveries.id, id))
          .returning();
        return row ?? null;
      },
    },

    billing: {
      async subscriptionFor(userId) {
        const [row] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1);
        return row ?? null;
      },
    },

    webhooks: {
      async applySubscriptionEvent({ eventId, eventType, change }) {
        const applied = await db.transaction(async (tx) => {
          if (!(await claimEvent(tx, eventId, eventType))) return false;
          if (!change) return true;

          const [existing] = await tx
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.dodoSubscriptionId, change.dodoSubscriptionId))
            .limit(1);
          const write = planSubscriptionWrite(existing ?? null, change);

          if (write.kind === "update") {
            await tx
              .update(subscriptions)
              .set({ ...write.values, updatedAt: new Date() })
              .where(eq(subscriptions.dodoSubscriptionId, change.dodoSubscriptionId));
          } else if (write.kind === "create") {
            const v = write.values;
            await tx
              .insert(subscriptions)
              .values(v)
              // An Account re-subscribing after cancelling already has a row.
              .onConflictDoUpdate({
                target: subscriptions.userId,
                set: {
                  dodoSubscriptionId: v.dodoSubscriptionId,
                  dodoCustomerId: v.dodoCustomerId,
                  dodoProductId: v.dodoProductId,
                  plan: v.plan,
                  period: v.period,
                  status: v.status,
                  currentPeriodEnd: v.currentPeriodEnd,
                  lastEventAt: v.lastEventAt,
                  updatedAt: new Date(),
                },
              });
          }
          return true;
        });
        return applied ? "applied" : "duplicate";
      },

      async applyGithubEvent({ eventId, eventType, removedInstallation }) {
        const applied = await db.transaction(async (tx) => {
          if (!(await claimEvent(tx, eventId, eventType))) return false;
          if (removedInstallation !== null) {
            await tx
              .delete(integrationConnections)
              .where(
                and(
                  eq(integrationConnections.provider, "github"),
                  eq(integrationConnections.externalId, removedInstallation),
                ),
              );
          }
          return true;
        });
        return applied ? "applied" : "duplicate";
      },
    },

    waitlist: {
      async add(email, source) {
        const [row] = await db
          .insert(waitlistSignups)
          .values({ email, source })
          .onConflictDoNothing({ target: waitlistSignups.email })
          .returning();
        return row ?? null;
      },
      async setEmailStatus(id, outcome) {
        await db
          .update(waitlistSignups)
          .set(
            outcome.status === "sent"
              ? { emailStatus: "sent" }
              : { emailStatus: "failed", emailError: outcome.error },
          )
          .where(eq(waitlistSignups.id, id));
      },
    },

    signIn: {
      async recordAttempt(identifier, { at, since, keep }) {
        return db.transaction(async (tx) => {
          const [pending] = await tx
            .select({ identifier: verificationTokens.identifier })
            .from(verificationTokens)
            .where(and(eq(verificationTokens.identifier, identifier), gt(verificationTokens.expires, at)))
            .limit(1);
          if (!pending) return 0;
          // Attempts arriving together wait here for one another, so each
          // counts the ones before it.
          const recent = (await lockSignIn(tx, identifier)).filter((time) => time >= since);
          await tx
            .update(signInAttempts)
            .set({ attemptedAt: [...recent, at].slice(-keep) })
            .where(eq(signInAttempts.identifier, identifier));
          return recent.length + 1;
        });
      },
      async replaceCode({ identifier, token, expires }) {
        await db.transaction(async (tx) => {
          await lockSignIn(tx, identifier);
          await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
          await tx.insert(verificationTokens).values({ identifier, token, expires });
        });
      },
      async revokeCodes(identifier) {
        await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
      },
      async forgetAttempts(identifier) {
        await db.delete(signInAttempts).where(eq(signInAttempts.identifier, identifier));
      },
    },

    authAdapter() {
      return DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
      });
    },
  };
}
