import type { ProjectKey } from "@ganeshdole/brainbox-shared";

import { api } from "../../convex/_generated/api.js";
import type { ConvexCaller } from "../convex-client.ts";
import { createConvexAuthAdapter } from "./convex-auth.ts";
import type {
  ConnectionRecord,
  DeliveryRecord,
  DestinationRecord,
  IssueEventRecord,
  FeatureRecord,
  IssueRecord,
  ProjectRecord,
  Store,
  SubscriptionRecord,
  TeamInviteRecord,
  TeamMemberRecord,
  TeamRecord,
  WaitlistSignupRecord,
} from "./types.ts";

/** The Convex store: each method is one Convex function (convex/*.ts), which
 *  also does the cascades Postgres gets from foreign keys. Convex keeps epoch
 *  milliseconds; records leave here with Dates like every other store. */
export function createConvexStore(convex: ConvexCaller): Store {
  return {
    teams: {
      async create(input) {
        return toTeam(await convex.mutation(api.teams.create, input));
      },
      async get(id) {
        return maybe(await convex.query(api.teams.get, { id }), toTeam);
      },
      async rename(id, name) {
        return maybe(await convex.mutation(api.teams.rename, { id, name }), toTeam);
      },
      async listForUser(userId) {
        const rows = await convex.query(api.teams.listForUser, { userId });
        return rows.map((row) => ({ ...toTeam(row), role: row.role }));
      },
      async membership(teamId, userId) {
        return maybe(await convex.query(api.teams.membership, { teamId, userId }), toTeamMember);
      },
      async members(teamId) {
        const rows = await convex.query(api.teams.members, { teamId });
        return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
      },
      async setRole(teamId, userId, role) {
        return convex.mutation(api.teams.setRole, { teamId, userId, role });
      },
      async removeMember(teamId, userId) {
        return convex.mutation(api.teams.removeMember, { teamId, userId });
      },
      async createInvite({ expiresAt, ...input }) {
        return toInvite(await convex.mutation(api.teams.createInvite, { ...input, expiresAt: expiresAt.getTime() }));
      },
      async getInvite(id) {
        return maybe(await convex.query(api.teams.getInvite, { id }), toInvite);
      },
      async listInvites(teamId) {
        return (await convex.query(api.teams.listInvites, { teamId })).map(toInvite);
      },
      async invitesForEmail(email) {
        return (await convex.query(api.teams.invitesForEmail, { email })).map(toInvite);
      },
      async revokeInvite(teamId, id) {
        await convex.mutation(api.teams.revokeInvite, { teamId, id });
      },
      async acceptInvite(id, userId, now) {
        return convex.mutation(api.teams.acceptInvite, { id, userId, now: now.getTime() });
      },
    },

    projects: {
      async listForTeams(teamIds) {
        const rows = await convex.query(api.projects.listForTeams, { teamIds });
        return rows.map((row) => ({
          ...toProject(row),
          issueCount: row.issueCount,
          featureRequestCount: row.featureRequestCount ?? 0,
        }));
      },
      async create(input) {
        return toProject(await convex.mutation(api.projects.create, input));
      },
      async get(id) {
        return maybe(await convex.query(api.projects.get, { id }), toProject);
      },
      async getByKey(key) {
        return maybe(await convex.query(api.projects.getByKey, { key }), toProject);
      },
      async update(id, patch) {
        return maybe(await convex.mutation(api.projects.update, { id, ...patch }), toProject);
      },
      async delete(id) {
        await convex.mutation(api.projects.remove, { id });
      },
    },

    issues: {
      async listForProject(projectId) {
        return (await convex.query(api.issues.listForProject, { projectId })).map(toIssue);
      },
      async get(id) {
        return maybe(await convex.query(api.issues.get, { id }), toIssue);
      },
      async create({ createdAt, ...input }) {
        await convex.mutation(api.issues.create, {
          ...input,
          ...(createdAt && { createdAt: createdAt.getTime() }),
        });
      },
      async setTranscript(id, kind, outcome) {
        await convex.mutation(api.issues.setTranscript, {
          id,
          kind,
          status: outcome.status,
          ...(outcome.status === "done" && { text: outcome.text }),
        });
      },
      async triage(ids, patch, actorId) {
        return (await convex.mutation(api.issues.triage, { ids: [...ids], patch, actorId })).map(toIssue);
      },
      async listEvents(issueId) {
        return (await convex.query(api.issues.listEvents, { issueId })).map(toIssueEvent);

      },
      async setFeature(id, featureId) {
        await convex.mutation(api.issues.setFeature, { id, featureId });
      },
    },

    features: {
      async listForProject(projectId) {
        return (await convex.query(api.features.listForProject, { projectId })).map((row) => ({
          ...toFeature(row),
          requestCount: row.requestCount,
        }));
      },
      async get(id) {
        return maybe(await convex.query(api.features.get, { id }), toFeature);
      },
      async create(input) {
        return toFeature(await convex.mutation(api.features.create, input));
      },
      async update(id, patch) {
        return maybe(await convex.mutation(api.features.update, { id, ...patch }), toFeature);
      },
      async delete(id) {
        await convex.mutation(api.features.remove, { id });
      },
      async merge(fromId, intoId) {
        await convex.mutation(api.features.merge, { fromId, intoId });
      },
    },

    integrations: {
      async listConnections(teamId) {
        return (await convex.query(api.integrations.listConnections, { teamId })).map(toConnection);
      },
      async getConnection(id) {
        return maybe(await convex.query(api.integrations.getConnection, { id }), toConnection);
      },
      async saveConnection(input) {
        await convex.mutation(api.integrations.saveConnection, input);
      },
      async deleteConnection(id) {
        await convex.mutation(api.integrations.deleteConnection, { id });
      },
      async listDestinations(projectId) {
        return (await convex.query(api.integrations.listDestinations, { projectId })).map(toDestination);
      },
      async saveDestination(input) {
        return toDestination(await convex.mutation(api.integrations.saveDestination, input));
      },
      async deleteDestination(projectId, provider) {
        await convex.mutation(api.integrations.deleteDestination, { projectId, provider });
      },
      async deliveryTargets(projectId, { includePaused }) {
        const rows = await convex.query(api.integrations.deliveryTargets, { projectId, includePaused });
        return rows.map((row) => ({
          destination: toDestination(row.destination),
          connection: toConnection(row.connection),
        }));
      },
      async listDeliveries(issueId) {
        return (await convex.query(api.integrations.listDeliveries, { issueId })).map(toDelivery);
      },
      async claimDelivery(input) {
        return maybe(await convex.mutation(api.integrations.claimDelivery, input), toDelivery);
      },
      async finishDelivery(id, outcome) {
        return maybe(await convex.mutation(api.integrations.finishDelivery, { id, outcome }), toDelivery);
      },
    },

    billing: {
      async subscriptionFor(userId) {
        return maybe(await convex.query(api.billing.subscriptionFor, { userId }), toSubscription);
      },
    },

    webhooks: {
      async applySubscriptionEvent({ eventId, eventType, change }) {
        return convex.mutation(api.webhooks.applySubscriptionEvent, {
          eventId,
          eventType,
          change: change && {
            ...change,
            currentPeriodEnd: change.currentPeriodEnd?.getTime() ?? null,
            sentAt: change.sentAt.getTime(),
          },
        });
      },
      async applyGithubEvent(event) {
        return convex.mutation(api.webhooks.applyGithubEvent, event);
      },
    },

    waitlist: {
      async add(email, source) {
        return maybe(await convex.mutation(api.waitlist.add, { email, source }), toWaitlistSignup);
      },
      async setEmailStatus(id, outcome) {
        await convex.mutation(api.waitlist.setEmailStatus, { id, outcome });
      },
    },

    signIn: {
      async recordAttempt(identifier, { at, since, keep }) {
        return convex.mutation(api.signIn.recordAttempt, {
          identifier,
          at: at.getTime(),
          since: since.getTime(),
          keep,
        });
      },
      async replaceCode({ identifier, token, expires }) {
        await convex.mutation(api.signIn.replaceCode, { identifier, token, expires: expires.getTime() });
      },
      async revokeCodes(identifier) {
        await convex.mutation(api.signIn.revokeCodes, { identifier });
      },
      async forgetAttempts(identifier) {
        await convex.mutation(api.signIn.forgetAttempts, { identifier });
      },
    },

    authAdapter() {
      return createConvexAuthAdapter(convex);
    },
  };
}

function maybe<T, R>(row: T | null, convert: (row: T) => R): R | null {
  return row === null ? null : convert(row);
}

function toProjectKey(key: string): ProjectKey {
  if (!key.startsWith("pk_")) throw new Error(`stored project key "${key}" is malformed`);
  return key as ProjectKey;
}

type Stamped<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] extends Date ? number : number | null };

/** The Team a project or connection belongs to. Rows from before Teams have
 *  none until convex/migrations.ts has run. */
function teamOf(row: { id: string; teamId?: string }): string {
  if (row.teamId === undefined) {
    throw new Error(`row ${row.id} has no team: run \`npx convex run migrations:teams\``);
  }
  return row.teamId;
}

function toTeam(row: Stamped<TeamRecord, "createdAt">): TeamRecord {
  return { id: row.id, name: row.name, createdAt: new Date(row.createdAt) };
}

function toTeamMember(row: Stamped<TeamMemberRecord, "createdAt">): TeamMemberRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function toInvite(row: Stamped<TeamInviteRecord, "createdAt" | "expiresAt">): TeamInviteRecord {
  return { ...row, expiresAt: new Date(row.expiresAt), createdAt: new Date(row.createdAt) };
}

function toProject(
  row: Stamped<Omit<ProjectRecord, "key" | "teamId">, "createdAt"> & { key: string; teamId?: string },
): ProjectRecord {
  return {
    id: row.id,
    teamId: teamOf(row),
    name: row.name,
    key: toProjectKey(row.key),
    allowedOrigins: row.allowedOrigins,
    createdAt: new Date(row.createdAt),
  };
}

// Issues stored before feature requests or triage lack those fields. They
// read as bugs, and as "open": the same backfill the Postgres migrations did.
type IssueDoc = Omit<
  Stamped<IssueRecord, "createdAt">,
  "kind" | "importance" | "featureId" | "status" | "priority" | "closeReason" | "statusChangedAt"
> &
  Partial<Pick<IssueRecord, "kind" | "importance" | "featureId" | "status" | "priority">> & {
    closeReason?: IssueRecord["closeReason"];
    statusChangedAt?: number | null;
  };

function toIssue({ status, priority, closeReason, statusChangedAt, ...row }: IssueDoc): IssueRecord {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    kind: row.kind ?? "bug",
    importance: row.importance ?? null,
    featureId: row.featureId ?? null,
    status: status ?? "open",
    priority: priority ?? "none",
    closeReason: closeReason ?? null,
    statusChangedAt: statusChangedAt == null ? null : new Date(statusChangedAt),
  };
}

function toIssueEvent(row: Stamped<IssueEventRecord, "createdAt">): IssueEventRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

function toFeature(row: Stamped<FeatureRecord, "createdAt" | "updatedAt">): FeatureRecord {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

function toConnection(
  row: Stamped<Omit<ConnectionRecord, "teamId">, "createdAt"> & { teamId?: string; ownerId?: string },
): ConnectionRecord {
  return {
    id: row.id,
    teamId: teamOf(row),
    provider: row.provider,
    externalId: row.externalId,
    label: row.label,
    createdAt: new Date(row.createdAt),
  };
}

function toDestination(row: Stamped<DestinationRecord, "createdAt" | "updatedAt">): DestinationRecord {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

function toDelivery(row: Stamped<DeliveryRecord, "createdAt" | "updatedAt">): DeliveryRecord {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

function toSubscription(
  row: Stamped<SubscriptionRecord, "createdAt" | "updatedAt" | "currentPeriodEnd" | "lastEventAt">,
): SubscriptionRecord {
  return {
    ...row,
    currentPeriodEnd: row.currentPeriodEnd === null ? null : new Date(row.currentPeriodEnd),
    lastEventAt: row.lastEventAt === null ? null : new Date(row.lastEventAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function toWaitlistSignup(row: Stamped<WaitlistSignupRecord, "createdAt">): WaitlistSignupRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
}

/** Record converters, also used by the test harness to read whole tables. */
export const fromConvex = {
  connection: toConnection,
  destination: toDestination,
  waitlistSignup: toWaitlistSignup,
};
