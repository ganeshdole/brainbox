import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  billingPeriod,
  deliveryStatus,
  destinationConfig,
  inviteRole,
  issueEventKind,
  featureFields,
  issueFields,
  nullable,
  planId,
  provider,
  subscriptionStatus,
  teamRole,
  waitlistEmailStatus,
} from "./validators.ts";

// The Convex store's tables: the same data as the Postgres schema in
// src/db/schema/. Foreign-key cascades that Postgres does for free are done by
// hand in the mutations that delete.
export default defineSchema({
  // Auth.js: users (our Accounts), OAuth links and magic-link tokens.
  users: defineTable({
    id: v.string(),
    email: v.string(),
    name: v.optional(nullable(v.string())),
    firstName: v.optional(nullable(v.string())),
    lastName: v.optional(nullable(v.string())),
    emailVerified: nullable(v.number()),
    image: v.optional(nullable(v.string())),
  })
    .index("with_id", ["id"])
    .index("by_email", ["email"]),

  authAccounts: defineTable({
    userId: v.string(),
    type: v.string(),
    provider: v.string(),
    providerAccountId: v.string(),
    refresh_token: v.optional(v.string()),
    access_token: v.optional(v.string()),
    expires_at: v.optional(v.number()),
    token_type: v.optional(v.string()),
    scope: v.optional(v.string()),
    id_token: v.optional(v.string()),
    session_state: v.optional(v.string()),
  })
    .index("by_provider_account", ["provider", "providerAccountId"])
    .index("by_user", ["userId"]),

  verificationTokens: defineTable({
    identifier: v.string(),
    token: v.string(),
    expires: v.number(),
  }).index("by_identifier_token", ["identifier", "token"]),

  // When each email last attempted a sign-in code (src/auth/code-attempts.ts).
  signInAttempts: defineTable({
    identifier: v.string(),
    attemptedAt: v.array(v.number()),
  }).index("by_identifier", ["identifier"]),

  // A Team owns projects and connections; people reach them as its members.
  teams: defineTable({
    id: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("with_id", ["id"]),

  teamMembers: defineTable({
    teamId: v.string(),
    userId: v.string(),
    role: teamRole,
    createdAt: v.number(),
  })
    .index("by_team_user", ["teamId", "userId"])
    .index("by_user", ["userId"]),

  // Invites not yet accepted; accepting deletes one. One per (team, email).
  teamInvites: defineTable({
    id: v.string(),
    teamId: v.string(),
    email: v.string(),
    role: inviteRole,
    invitedBy: nullable(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("with_id", ["id"])
    .index("by_team_email", ["teamId", "email"])
    .index("by_email", ["email"]),

  // `ownerId` is how projects and connections were owned before Teams, and
  // `teamId` is optional only so a deployment holding such rows still
  // validates: migrations:teams moves them over. The store refuses a row
  // without a teamId.
  projects: defineTable({
    id: v.string(),
    teamId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    name: v.string(),
    key: v.string(),
    allowedOrigins: v.array(v.string()),
    createdAt: v.number(),
    // Kept up to date by issues.create and project deletion, so listing
    // projects never reads every issue.
    issueCount: v.number(),
    // How many of those are feature requests, kept the same way. Absent on
    // projects from before features: none of their issues were.
    featureRequestCount: v.optional(v.number()),
  })
    .index("with_id", ["id"])
    .index("by_key", ["key"])
    .index("by_team", ["teamId"]),

  issues: defineTable(issueFields)
    .index("with_id", ["id"])
    .index("by_project", ["projectId"])
    .index("by_feature", ["featureId"]),

  features: defineTable(featureFields)
    .index("with_id", ["id"])
    .index("by_project", ["projectId"]),

  // Append-only triage log; removed with its issue (projects.remove).
  issueEvents: defineTable({
    id: v.string(),
    issueId: v.string(),
    actorId: nullable(v.string()),
    kind: issueEventKind,
    from: nullable(v.string()),
    to: nullable(v.string()),
    createdAt: v.number(),
  }).index("by_issue", ["issueId", "createdAt"]),

  connections: defineTable({
    id: v.string(),
    teamId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    provider,
    externalId: v.string(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("with_id", ["id"])
    .index("by_team", ["teamId"])
    .index("by_team_provider_external", ["teamId", "provider", "externalId"])
    .index("by_provider_external", ["provider", "externalId"]),

  destinations: defineTable({
    id: v.string(),
    projectId: v.string(),
    connectionId: v.string(),
    provider,
    config: destinationConfig,
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("with_id", ["id"])
    .index("by_project_provider", ["projectId", "provider"])
    .index("by_connection", ["connectionId"]),

  deliveries: defineTable({
    id: v.string(),
    issueId: v.string(),
    destinationId: nullable(v.string()),
    provider,
    status: deliveryStatus,
    externalId: nullable(v.string()),
    externalUrl: nullable(v.string()),
    error: nullable(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("with_id", ["id"])
    .index("by_issue_destination", ["issueId", "destinationId"])
    .index("by_destination", ["destinationId"]),

  subscriptions: defineTable({
    id: v.string(),
    userId: v.string(),
    dodoSubscriptionId: v.string(),
    dodoCustomerId: v.string(),
    dodoProductId: v.string(),
    plan: planId,
    period: billingPeriod,
    status: subscriptionStatus,
    currentPeriodEnd: nullable(v.number()),
    lastEventAt: nullable(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_dodo_id", ["dodoSubscriptionId"]),

  webhookEvents: defineTable({
    id: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index("with_id", ["id"]),

  waitlistSignups: defineTable({
    id: v.string(),
    email: v.string(),
    source: v.string(),
    emailStatus: waitlistEmailStatus,
    emailError: nullable(v.string()),
    createdAt: v.number(),
  })
    .index("with_id", ["id"])
    .index("by_email", ["email"]),

  // Storage keys (the same "<project>/<issue>/<file>" scheme as every driver)
  // mapped to Convex file storage.
  files: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
  }).index("by_key", ["key"]),
});
