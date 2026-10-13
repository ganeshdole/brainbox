import { v, type Infer } from "convex/values";

// Validators for the shapes Brainbox stores, mirroring @ganeshdole/brainbox-shared.
// Kept in one place so tables and function arguments agree.

export const nullable = <T extends Parameters<typeof v.union>[0]>(value: T) => v.union(value, v.null());

export const region = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  selector: v.optional(v.string()),
});

export const capturedMetadata = v.object({
  url: v.string(),
  title: v.string(),
  viewport: v.object({ width: v.number(), height: v.number() }),
  devicePixelRatio: v.number(),
  userAgent: v.string(),
  language: v.string(),
  timezone: v.string(),
  selector: v.optional(v.string()),
  consoleErrors: v.array(v.string()),
  identity: v.optional(
    v.object({
      id: v.optional(v.string()),
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      phone: v.optional(v.string()),
    }),
  ),
  fields: v.optional(
    v.array(
      v.object({
        label: v.string(),
        value: v.string(),
        type: v.optional(
          v.union(v.literal("text"), v.literal("email"), v.literal("phone"), v.literal("url"), v.literal("id")),
        ),
        highlight: v.optional(v.boolean()),
      }),
    ),
  ),
});

export const issueStatus = v.union(
  v.literal("new"),
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
  v.literal("closed"),
);
export const issuePriority = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);
export const issueCloseReason = v.union(
  v.literal("wont_fix"),
  v.literal("duplicate"),
  v.literal("not_reproducible"),
  v.literal("spam"),
);
export const issueEventKind = v.union(v.literal("status"), v.literal("priority"), v.literal("close_reason"));

export const transcriptStatus = v.union(v.literal("pending"), v.literal("done"), v.literal("failed"));
export const provider = v.literal("github");
export const deliveryStatus = v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"));
export const destinationConfig = v.object({
  owner: v.string(),
  repo: v.string(),
  labels: v.array(v.string()),
});

export const planId = v.union(v.literal("pro"), v.literal("business"));
export const billingPeriod = v.union(v.literal("monthly"), v.literal("annual"));
export const subscriptionStatus = v.union(
  v.literal("active"),
  v.literal("on_hold"),
  v.literal("cancelled"),
  v.literal("expired"),
  v.literal("pending"),
);
export const waitlistEmailStatus = v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"));

// Timestamps are epoch milliseconds; the backend's Convex store turns them
// into Dates. Ids are UUID strings in an `id` field, the same ids the Postgres
// store hands out, so records look identical whichever store holds them.

export const issueFields = {
  id: v.string(),
  projectId: v.string(),
  createdAt: v.number(),
  // Triage. Optional because issues stored before triage existed lack them;
  // the backend reads a missing status as "open" (see src/store/convex.ts),
  // the same backfill the Postgres migration did.
  status: v.optional(issueStatus),
  priority: v.optional(issuePriority),
  closeReason: v.optional(nullable(issueCloseReason)),
  statusChangedAt: v.optional(nullable(v.number())),
  text: nullable(v.string()),
  screenshotKey: nullable(v.string()),
  cropKey: nullable(v.string()),
  videoKey: nullable(v.string()),
  videoMime: nullable(v.string()),
  videoTranscript: nullable(v.string()),
  videoTranscriptStatus: nullable(transcriptStatus),
  sessionKey: nullable(v.string()),
  audioKey: nullable(v.string()),
  audioMime: nullable(v.string()),
  audioTranscript: nullable(v.string()),
  audioTranscriptStatus: nullable(transcriptStatus),
  region: nullable(region),
  metadata: capturedMetadata,
};

export const issueDoc = v.object(issueFields);
export type IssueDoc = Infer<typeof issueDoc>;

export const teamRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
export const inviteRole = v.union(v.literal("admin"), v.literal("member"));
