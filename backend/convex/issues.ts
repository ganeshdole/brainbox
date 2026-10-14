import { v } from "convex/values";

import { newestFirst, serverMutation, serverQuery, strip } from "./lib/server.ts";
import { issueFields } from "./validators.ts";

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
  featureId: _feature,
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
      audioTranscript: null,
      videoTranscript: null,
      featureId: null,
    });
    await ctx.db.patch(project._id, {
      issueCount: project.issueCount + 1,
      ...(input.kind === "feature" && { featureRequestCount: (project.featureRequestCount ?? 0) + 1 }),
    });
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

export const setFeature = serverMutation({
  args: { id: v.string(), featureId: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, featureId }) => {
    const row = await ctx.db
      .query("issues")
      .withIndex("with_id", (q) => q.eq("id", id))
      .unique();
    if (row) await ctx.db.patch(row._id, { featureId });
  },
});
