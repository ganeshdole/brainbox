import type { Issue } from "./issue.ts";

/**
 * Where a feature stands, as the customer tells their users. A public board
 * will show it; today the dashboard does.
 *
 * - `under_review` new, not decided yet (where every feature starts)
 * - `planned`      decided, not started
 * - `in_progress`  being built
 * - `shipped`      live
 * - `declined`     not going to happen
 */
export type FeatureStatus = "under_review" | "planned" | "in_progress" | "shipped" | "declined";

/**
 * One thing the customer's users want built, as the customer tracks it. It
 * collects requests: the feature-request Issues end-users file through the
 * widget. The feature's own title, description and status are the customer's
 * words and safe to show publicly; its requests carry who asked and their
 * app's details, and are not.
 */
export interface Feature {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: FeatureStatus;
  /** How many requests are attached: the demand for it. */
  requestCount: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** A feature with its requests, newest first. */
export interface FeatureDetail extends Feature {
  requests: Issue[];
}
