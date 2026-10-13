import type { ProjectKey } from "@ganeshdole/brainbox-shared";

import { api } from "../../convex/_generated/api.js";
import type { ConvexCaller } from "../convex-client.ts";
import { createConvexAuthAdapter } from "./convex-auth.ts";
import type {
  ConnectionRecord,
  DeliveryRecord,
  DestinationRecord,
  IssueRecord,
  ProjectRecord,
  Store,
  SubscriptionRecord,
  WaitlistSignupRecord,
} from "./types.ts";

/** The Convex store: each method is one Convex function (convex/*.ts), which
 *  also does the cascades Postgres gets from foreign keys. Convex keeps epoch
 *  milliseconds; records leave here with Dates like every other store. */
export function createConvexStore(convex: ConvexCaller): Store {
  return {
    projects: {
      async listForOwner(ownerId) {
        const rows = await convex.query(api.projects.listForOwner, { ownerId });
        return rows.map((row) => ({ ...toProject(row), issueCount: row.issueCount }));
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
    },

    integrations: {
      async listConnections(ownerId) {
        return (await convex.query(api.integrations.listConnections, { ownerId })).map(toConnection);
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

function toProject(row: Stamped<Omit<ProjectRecord, "key">, "createdAt"> & { key: string }): ProjectRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    key: toProjectKey(row.key),
    allowedOrigins: row.allowedOrigins,
    createdAt: new Date(row.createdAt),
  };
}

/** Issues stored before feature requests have no kind or importance. */
type StoredIssue = Omit<Stamped<IssueRecord, "createdAt">, "kind" | "importance"> &
  Partial<Pick<IssueRecord, "kind" | "importance">>;

function toIssue(row: StoredIssue): IssueRecord {
  return {
    ...row,
    kind: row.kind ?? "bug",
    importance: row.importance ?? null,
    createdAt: new Date(row.createdAt),
  };
}

function toConnection(row: Stamped<ConnectionRecord, "createdAt">): ConnectionRecord {
  return { ...row, createdAt: new Date(row.createdAt) };
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
