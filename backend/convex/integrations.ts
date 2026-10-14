import { v } from "convex/values";

import { newestFirst, removeConnection, removeDestination, serverMutation, serverQuery, strip } from "./lib/server.ts";
import { connectionAuth, connectionStatus, destinationConfig, nullable, provider } from "./validators.ts";

// Store.integrations. See src/store/types.ts for the contract.

export const listConnections = serverQuery({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    return newestFirst(rows).map(strip);
  },
});

export const getConnection = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    return row && strip(row);
  },
});

/** Insert, or replace the label, auth and credentials of the same (team,
 *  provider, externalId). Either way it ends up active. */
export const saveConnection = serverMutation({
  args: {
    teamId: v.string(),
    provider,
    externalId: v.string(),
    label: v.string(),
    auth: connectionAuth,
    credentials: nullable(v.string()),
  },
  handler: async (ctx, input) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_team_provider_external", (q) =>
        q.eq("teamId", input.teamId).eq("provider", input.provider).eq("externalId", input.externalId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        label: input.label,
        auth: input.auth,
        credentials: input.credentials,
        status: "active",
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) throw new Error("connection vanished during save");
      return strip(updated);
    }
    const record = { ...input, status: "active" as const, id: crypto.randomUUID(), createdAt: Date.now() };
    await ctx.db.insert("connections", record);
    return record;
  },
});

export const setConnectionStatus = serverMutation({
  args: { id: v.string(), status: connectionStatus },
  handler: async (ctx, { id, status }) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (row) await ctx.db.patch(row._id, { status });
  },
});

export const deleteConnection = serverMutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => removeConnection(ctx.db, id),
});

export const listDestinations = serverQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("destinations")
      .withIndex("by_project_provider", (q) => q.eq("projectId", projectId))
      .collect();
    return rows.map(strip);
  },
});

/** One destination per (project, provider): insert or replace. */
export const saveDestination = serverMutation({
  args: {
    projectId: v.string(),
    provider,
    connectionId: v.string(),
    config: destinationConfig,
    enabled: v.boolean(),
  },
  handler: async (ctx, input) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("destinations")
      .withIndex("by_project_provider", (q) =>
        q.eq("projectId", input.projectId).eq("provider", input.provider),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        connectionId: input.connectionId,
        config: input.config,
        enabled: input.enabled,
        updatedAt: now,
      });
      const updated = await ctx.db.get(existing._id);
      if (!updated) throw new Error("destination vanished during save");
      return strip(updated);
    }
    const record = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await ctx.db.insert("destinations", record);
    return record;
  },
});

export const deleteDestination = serverMutation({
  args: { projectId: v.string(), provider },
  handler: async (ctx, { projectId, provider }) => {
    const existing = await ctx.db
      .query("destinations")
      .withIndex("by_project_provider", (q) => q.eq("projectId", projectId).eq("provider", provider))
      .unique();
    if (existing) await removeDestination(ctx.db, existing.id);
  },
});

/** A project's destinations with their connections; paused ones only on request. */
export const deliveryTargets = serverQuery({
  args: { projectId: v.string(), includePaused: v.boolean() },
  handler: async (ctx, { projectId, includePaused }) => {
    const destinations = await ctx.db
      .query("destinations")
      .withIndex("by_project_provider", (q) => q.eq("projectId", projectId))
      .collect();
    const targets = [];
    for (const destination of destinations) {
      if (!includePaused && !destination.enabled) continue;
      const connection = await ctx.db
        .query("connections")
        .withIndex("with_id", (q) => q.eq("id", destination.connectionId))
        .unique();
      if (connection) targets.push({ destination: strip(destination), connection: strip(connection) });
    }
    return targets;
  },
});

export const listDeliveries = serverQuery({
  args: { issueId: v.string() },
  handler: async (ctx, { issueId }) => {
    const rows = await ctx.db
      .query("deliveries")
      .withIndex("by_issue_destination", (q) => q.eq("issueId", issueId))
      .collect();
    return rows.map(strip);
  },
});

/**
 * Start one delivery as pending. Null when this (issue, destination) already
 * has one; with `retry` that one is reset to pending instead.
 */
export const claimDelivery = serverMutation({
  args: { issueId: v.string(), destinationId: v.string(), provider, retry: v.boolean() },
  handler: async (ctx, { issueId, destinationId, provider, retry }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("deliveries")
      .withIndex("by_issue_destination", (q) => q.eq("issueId", issueId).eq("destinationId", destinationId))
      .unique();
    if (existing) {
      if (!retry) return null;
      await ctx.db.patch(existing._id, { status: "pending", error: null, updatedAt: now });
      const reset = await ctx.db.get(existing._id);
      return reset && strip(reset);
    }
    const record = {
      id: crypto.randomUUID(),
      issueId,
      destinationId,
      provider,
      status: "pending" as const,
      externalId: null,
      externalUrl: null,
      error: null,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.insert("deliveries", record);
    return record;
  },
});

/** Record the outcome and count the attempt. A failure keeps any earlier link. */
export const finishDelivery = serverMutation({
  args: {
    id: v.string(),
    outcome: v.union(
      v.object({ ok: v.literal(true), externalId: v.string(), url: v.string() }),
      v.object({ ok: v.literal(false), error: v.string() }),
    ),
  },
  handler: async (ctx, { id, outcome }) => {
    const row = await ctx.db
      .query("deliveries")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: outcome.ok ? "sent" : "failed",
      ...(outcome.ok && { externalId: outcome.externalId, externalUrl: outcome.url }),
      error: outcome.ok ? null : outcome.error,
      attempts: row.attempts + 1,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(row._id);
    return updated && strip(updated);
  },
});
