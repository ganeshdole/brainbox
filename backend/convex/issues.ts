import { v } from "convex/values";

import { planTriageWrite } from "../src/store/issue-triage.ts";
import { newestFirst, serverMutation, serverQuery, strip } from "./lib/server.ts";
import { issueCloseReason, issueFields, issuePriority, issueStatus, nullable } from "./validators.ts";

// Store.issues. See src/store/types.ts for the contract.

export const listForProject = serverQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("issues")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    return newestFirst(rows).map(strip);
  },
});

export const get = serverQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("issues")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    return row && strip(row);
  },
});

const {
  createdAt: _createdAt,
  audioTranscript: _audio,
  videoTranscript: _video,
  status: _status,
  priority: _priority,
  closeReason: _closeReason,
  statusChangedAt: _statusChangedAt,
  ...newIssueFields
} = issueFields;

/** Inserts the issue and counts it on its project. `createdAt` defaults to now. */
export const create = serverMutation({
  args: { ...newIssueFields, createdAt: v.optional(v.number()) },
  handler: async (ctx, { createdAt, ...input }) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("with_id", (q) => q.eq("id", input.projectId))
      .unique();
    if (!project) throw new Error(`no project ${input.projectId}`);
    await ctx.db.insert("issues", {
      ...input,
      createdAt: createdAt ?? Date.now(),
      status: "new",
      priority: "none",
      closeReason: null,
      statusChangedAt: null,
      audioTranscript: null,
      videoTranscript: null,
    });
    await ctx.db.patch(project._id, { issueCount: project.issueCount + 1 });
  },
});

export const setTranscript = serverMutation({
  args: {
    id: v.string(),
    kind: v.union(v.literal("audio"), v.literal("video")),
    status: v.union(v.literal("done"), v.literal("failed")),
    text: v.optional(v.string()),
  },
  handler: async (ctx, { id, kind, status, text }) => {
    const row = await ctx.db
      .query("issues")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (!row) return;
    await ctx.db.patch(
      row._id,
      kind === "audio"
        ? { audioTranscriptStatus: status, ...(text !== undefined && { audioTranscript: text }) }
        : { videoTranscriptStatus: status, ...(text !== undefined && { videoTranscript: text }) },
    );
  },
});

/** Applies one triage patch to every listed issue as planTriageWrite decides.
 *  One mutation, so all of it commits or (if the patch is rejected for any
 *  issue) none of it does. Returns the issues that exist, after the change. */
export const triage = serverMutation({
  args: {
    ids: v.array(v.string()),
    patch: v.object({
      status: v.optional(issueStatus),
      priority: v.optional(issuePriority),
      closeReason: v.optional(nullable(issueCloseReason)),
    }),
    actorId: nullable(v.string()),
  },
  handler: async (ctx, { ids, patch, actorId }) => {
    const now = Date.now();
    const out = [];
    for (const id of new Set(ids)) {
      const row = await ctx.db
        .query("issues")
        .withIndex("with_id", (q) => q.eq("id", id))
        .unique();
      if (!row) continue;
      const current = {
        status: row.status ?? "open",
        priority: row.priority ?? "none",
        closeReason: row.closeReason ?? null,
      };
      const write = planTriageWrite(current, patch, new Date(now));
      if (!write) {
        out.push(strip(row));
        continue;
      }
      const { statusChangedAt, ...values } = write.values;
      await ctx.db.patch(row._id, {
        ...values,
        ...(statusChangedAt && { statusChangedAt: statusChangedAt.getTime() }),
      });
      for (const event of write.events) {
        await ctx.db.insert("issueEvents", {
          id: crypto.randomUUID(),
          issueId: id,
          actorId,
          ...event,
          createdAt: now,
        });
      }
      const updated = await ctx.db.get(row._id);
      if (updated) out.push(strip(updated));
    }
    return out;
  },
});

/** Oldest first. */
export const listEvents = serverQuery({
  args: { issueId: v.string() },
  handler: async (ctx, { issueId }) => {
    const rows = await ctx.db
      .query("issueEvents")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .collect();
    return rows.map(strip);
  },
});
