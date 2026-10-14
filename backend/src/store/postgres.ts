import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { DB } from "../db/client.ts";
import {
  accounts,
  deliveries,
  features,
  integrationConnections,
  issueEvents,
  issues,
  projectDestinations,
  projects,
  sessions,
  signInAttempts,
  subscriptions,
  teamInvites,
  teamMembers,
  teams,
  users,
  verificationTokens,
  waitlistSignups,
  webhookEvents,
} from "../db/schema/index.ts";
import { planTriageWrite } from "./issue-triage.ts";
import { planSubscriptionWrite } from "./subscription-write.ts";
import { leavesNoOwner } from "./team-rules.ts";
import type { DestinationRecord, FullStore, InviteAcceptance, MembershipChange } from "./types.ts";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** A destination row as the record it is. The columns can't tie `config` to
 *  `provider`; `saveDestination`, the only writer, is typed so they match. */
function toDestination(row: typeof projectDestinations.$inferSelect): DestinationRecord {
  return row as DestinationRecord;
}

/** Record converters, also used by the test harness to read whole tables. */
export const fromPostgres = { destination: toDestination };

/** The Postgres store: Drizzle over postgres.js. Foreign keys do the cascades
 *  the `Store` contract describes. */
export function createPostgresStore(db: DB): FullStore {
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

  // Locks the Team's row for the rest of the transaction, so changes to its
  // members take turns, and returns the member being changed and how many
  // Owners there are.
  async function lockMembership(tx: Tx, teamId: string, userId: string) {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
    const rows = await tx.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
    return {
      member: rows.find((r) => r.userId === userId) ?? null,
      owners: rows.filter((r) => r.role === "owner").length,
    };
  }

  return {
    teams: {
      async create({ name, ownerId }) {
        return db.transaction(async (tx) => {
          const [team] = await tx.insert(teams).values({ name }).returning();
          if (!team) throw new Error("team insert returned no row");
          await tx.insert(teamMembers).values({ teamId: team.id, userId: ownerId, role: "owner" });
          return team;
        });
      },
      async get(id) {
        const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
        return row ?? null;
      },
      async rename(id, name) {
        const [row] = await db.update(teams).set({ name }).where(eq(teams.id, id)).returning();
        return row ?? null;
      },
      async listForUser(userId) {
        const rows = await db
          .select({ team: teams, role: teamMembers.role })
          .from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(eq(teamMembers.userId, userId))
          .orderBy(asc(teams.createdAt));
        return rows.map((r) => ({ ...r.team, role: r.role }));
      },
      async membership(teamId, userId) {
        const [row] = await db
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
          .limit(1);
        return row ?? null;
      },
      async members(teamId) {
        const rows = await db
          .select({ member: teamMembers, email: users.email, name: users.name, image: users.image })
          .from(teamMembers)
          .innerJoin(users, eq(users.id, teamMembers.userId))
          .where(eq(teamMembers.teamId, teamId))
          .orderBy(asc(teamMembers.createdAt));
        return rows.map((r) => ({ ...r.member, email: r.email, name: r.name, image: r.image }));
      },
      async setRole(teamId, userId, role) {
        return db.transaction(async (tx): Promise<MembershipChange> => {
          const { member, owners } = await lockMembership(tx, teamId, userId);
          if (!member) return "not_found";
          if (leavesNoOwner(owners, member.role, role)) return "last_owner";
          await tx
            .update(teamMembers)
            .set({ role })
            .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
          return "done";
        });
      },
      async removeMember(teamId, userId) {
        return db.transaction(async (tx): Promise<MembershipChange> => {
          const { member, owners } = await lockMembership(tx, teamId, userId);
          if (!member) return "not_found";
          if (leavesNoOwner(owners, member.role, null)) return "last_owner";
          await tx
            .delete(teamMembers)
            .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
          return "done";
        });
      },

      async createInvite(input) {
        // A fresh id on replace, so a link sent before stops working.
        const [row] = await db
          .insert(teamInvites)
          .values(input)
          .onConflictDoUpdate({
            target: [teamInvites.teamId, teamInvites.email],
            set: {
              id: crypto.randomUUID(),
              role: input.role,
              invitedBy: input.invitedBy,
              expiresAt: input.expiresAt,
              createdAt: new Date(),
            },
          })
          .returning();
        if (!row) throw new Error("invite upsert returned no row");
        return row;
      },
      async getInvite(id) {
        const [row] = await db.select().from(teamInvites).where(eq(teamInvites.id, id)).limit(1);
        return row ?? null;
      },
      async listInvites(teamId) {
        return db
          .select()
          .from(teamInvites)
          .where(eq(teamInvites.teamId, teamId))
          .orderBy(desc(teamInvites.createdAt));
      },
      async invitesForEmail(email) {
        return db
          .select()
          .from(teamInvites)
          .where(eq(teamInvites.email, email))
          .orderBy(desc(teamInvites.createdAt));
      },
      async revokeInvite(teamId, id) {
        await db.delete(teamInvites).where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.id, id)));
      },
      async acceptInvite(id, userId, now) {
        return db.transaction(async (tx): Promise<InviteAcceptance> => {
          // Of two accepts at once, the second waits here and then finds the
          // invite gone.
          const [invite] = await tx
            .select()
            .from(teamInvites)
            .where(eq(teamInvites.id, id))
            .for("update");
          if (!invite) return { status: "not_found" };
          if (invite.expiresAt <= now) return { status: "expired" };
          await tx.delete(teamInvites).where(eq(teamInvites.id, id));
          await tx
            .insert(teamMembers)
            .values({ teamId: invite.teamId, userId, role: invite.role })
            .onConflictDoNothing();
          return { status: "accepted", teamId: invite.teamId };
        });
      },
    },

    projects: {
      async listForTeams(teamIds) {
        if (teamIds.length === 0) return [];
        const rows = await db
          .select({
            project: projects,
            issueCount: count(issues.id),
            featureRequestCount: sql<number>`count(*) filter (where ${issues.kind} = 'feature')`.mapWith(Number),
          })
          .from(projects)
          .leftJoin(issues, eq(issues.projectId, projects.id))
          .where(inArray(projects.teamId, teamIds))
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
    },

    triage: {
      async apply(ids, patch, actorId) {
        if (ids.length === 0) return [];
        return db.transaction(async (tx) => {
          // Locked, in id order so two bulk edits can't deadlock, and so two
          // people triaging at once log a true from → to.
          const rows = await tx
            .select()
            .from(issues)
            .where(inArray(issues.id, [...ids]))
            .orderBy(asc(issues.id))
            .for("update");
          const now = new Date();
          const out: typeof rows = [];
          for (const current of rows) {
            const write = planTriageWrite(current, patch, now);
            if (!write) {
              out.push(current);
              continue;
            }
            const [row] = await tx.update(issues).set(write.values).where(eq(issues.id, current.id)).returning();
            if (!row) throw new Error(`issue ${current.id} vanished mid-triage`);
            await tx
              .insert(issueEvents)
              .values(write.events.map((e) => ({ ...e, issueId: current.id, actorId })));
            out.push(row);
          }
          return out;
        });
      },
      async listEvents(issueId) {
        return db
          .select()
          .from(issueEvents)
          .where(eq(issueEvents.issueId, issueId))
          .orderBy(asc(issueEvents.createdAt));
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
      async attach(issueId, featureId) {
        await db.update(issues).set({ featureId }).where(eq(issues.id, issueId));
      },
    },

    integrations: {
      async listConnections(teamId) {
        return db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.teamId, teamId))
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
        const [row] = await db
          .insert(integrationConnections)
          .values({ ...input, status: "active" })
          .onConflictDoUpdate({
            target: [
              integrationConnections.teamId,
              integrationConnections.provider,
              integrationConnections.externalId,
            ],
            set: { label: input.label, auth: input.auth, credentials: input.credentials, status: "active" },
          })
          .returning();
        if (!row) throw new Error("connection upsert returned no row");
        return row;
      },
      async setConnectionStatus(id, status) {
        await db.update(integrationConnections).set({ status }).where(eq(integrationConnections.id, id));
      },
      async deleteConnection(id) {
        await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
      },

      async listDestinations(projectId) {
        const rows = await db
          .select()
          .from(projectDestinations)
          .where(eq(projectDestinations.projectId, projectId));
        return rows.map(toDestination);
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
        return toDestination(row);
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
        return rows.map(({ destination, connection }) => ({ destination: toDestination(destination), connection }));
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

    billing: {
      async subscriptionFor(userId) {
        const [row] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1);
        return row ?? null;
      },
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

    auth: {
      adapter() {
        return DrizzleAdapter(db, {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
        });
      },
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
  };
}
