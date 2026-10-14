import type { Adapter } from "@auth/core/adapters";
import type {
  BillingPeriod,
  CapturedMetadata,
  ConnectionAuth,
  ConnectionStatus,
  DeliveryStatus,
  DestinationConfigs,
  FeatureStatus,
  Importance,
  IntegrationProvider,
  InviteRole,
  IssueCloseReason,
  IssueEvent,
  IssuePriority,
  IssueStatus,
  IssueTriagePatch,
  IssueKind,
  PlanId,
  ProjectKey,
  Region,
  SubscriptionStatus,
  TeamRole,
  TranscriptStatus,
} from "@ganeshdole/brainbox-shared";

import type { SealedCredentials } from "./credentials.ts";

// The backend's whole view of persistence. Routes, auth, billing and delivery
// talk to a `Store`; which database sits behind it is a deployment choice
// (DATABASE_DRIVER). A store is a small required core (projects and issues)
// plus optional modules (sign-in, teams, triage, features, integrations,
// billing, waitlist), so one written for another database can start with the
// core alone. Every implementation must pass the same integration suite.
//
// Records are plain objects with `Date` timestamps. Ids are strings the store
// assigns, except `issues.create`, whose id the caller picks so file keys can
// be built before the row exists.

export interface TeamRecord {
  id: string;
  name: string;
  createdAt: Date;
}

export interface TeamMemberRecord {
  teamId: string;
  userId: string;
  role: TeamRole;
  createdAt: Date;
}

/** A member with what the dashboard shows of them. */
export type TeamMemberProfile = TeamMemberRecord & {
  email: string;
  name: string | null;
  image: string | null;
};

export interface TeamInviteRecord {
  id: string;
  teamId: string;
  /** Lower-cased. */
  email: string;
  role: InviteRole;
  /** Null once the inviter's Account is gone. */
  invitedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/** How a change to a membership went. A Team always keeps an Owner, so the
 *  change that would leave it with none is refused as `last_owner`. */
export type MembershipChange = "done" | "not_found" | "last_owner";

export type InviteAcceptance =
  | { status: "accepted"; teamId: string }
  | { status: "not_found" }
  | { status: "expired" };

export interface ProjectRecord {
  id: string;
  /** The Team that owns it. */
  teamId: string;
  name: string;
  key: ProjectKey;
  /** Ingest origin allowlist; empty allows every origin. */
  allowedOrigins: string[];
  createdAt: Date;
}

export interface IssueRecord {
  id: string;
  projectId: string;
  createdAt: Date;
  status: IssueStatus;
  priority: IssuePriority;
  closeReason: IssueCloseReason | null;
  statusChangedAt: Date | null;
  kind: IssueKind;
  /** Only on a feature request, and only when the end-user picked one. */
  importance: Importance | null;
  /** The Feature a feature request is attached to; null while unsorted. */
  featureId: string | null;
  text: string | null;
  screenshotKey: string | null;
  cropKey: string | null;
  videoKey: string | null;
  videoMime: string | null;
  videoTranscript: string | null;
  videoTranscriptStatus: TranscriptStatus | null;
  sessionKey: string | null;
  audioKey: string | null;
  audioMime: string | null;
  audioTranscript: string | null;
  audioTranscriptStatus: TranscriptStatus | null;
  region: Region | null;
  metadata: CapturedMetadata;
}

/** A new issue. Transcripts arrive later through `issues.setTranscript`, and
 *  every new issue starts in triage as `new` with no priority.
 *  `createdAt` defaults to now; set it only when importing existing issues. */
export type NewIssue = Omit<
  IssueRecord,
  | "createdAt"
  | "audioTranscript"
  | "videoTranscript"
  | "featureId"
  | "status"
  | "priority"
  | "closeReason"
  | "statusChangedAt"
> & {
  createdAt?: Date;
};

/** One row of an issue's activity log. `actorId` is null for system changes
 *  and for an Account that has since been deleted. */
export interface IssueEventRecord {
  id: string;
  issueId: string;
  actorId: string | null;
  kind: IssueEvent["kind"];
  from: string | null;
  to: string | null;
  createdAt: Date;
}

export interface FeatureRecord {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectionRecord {
  id: string;
  /** The Team whose projects can use it. */
  teamId: string;
  provider: IntegrationProvider;
  /** The provider's id for the link, e.g. a GitHub App installation id, or
   *  `pat:<organization>` for an Azure DevOps token. */
  externalId: string;
  label: string;
  auth: ConnectionAuth;
  status: ConnectionStatus;
  /** Null for a GitHub App install, which mints its own tokens. */
  credentials: SealedCredentials | null;
  createdAt: Date;
}

/** One project's destination for one provider; `config` narrows on `provider`. */
export type DestinationRecord = {
  [P in IntegrationProvider]: {
    id: string;
    projectId: string;
    connectionId: string;
    provider: P;
    config: DestinationConfigs[P];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}[IntegrationProvider];

/** A destination to save: a record without what the store assigns. */
export type NewDestination = {
  [P in IntegrationProvider]: Omit<Extract<DestinationRecord, { provider: P }>, "id" | "createdAt" | "updatedAt">;
}[IntegrationProvider];

export interface DeliveryRecord {
  id: string;
  issueId: string;
  /** Null once the destination is removed, so the sent ticket's link survives. */
  destinationId: string | null;
  provider: IntegrationProvider;
  status: DeliveryStatus;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  dodoSubscriptionId: string;
  dodoCustomerId: string;
  dodoProductId: string;
  plan: PlanId;
  period: BillingPeriod;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** When the event that produced this state was sent; orders late retries. */
  lastEventAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WaitlistEmailStatus = "pending" | "sent" | "failed";

export interface WaitlistSignupRecord {
  id: string;
  email: string;
  source: string;
  emailStatus: WaitlistEmailStatus;
  emailError: string | null;
  createdAt: Date;
}

/** What a destination reported back, recorded by `integrations.finishDelivery`. */
export type DeliveryOutcome =
  | { ok: true; externalId: string; url: string }
  | { ok: false; error: string };

export type TranscriptOutcome = { status: "done"; text: string } | { status: "failed" };

/** A Dodo subscription webhook, already validated and mapped by the route.
 *  `change` is null for events that only need recording (not about a
 *  subscription, or a status we do not map). */
export interface SubscriptionEvent {
  eventId: string;
  eventType: string;
  change: SubscriptionChange | null;
}

export interface SubscriptionChange {
  dodoSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  sentAt: Date;
  /** Used only when no row has this `dodoSubscriptionId` yet: the checkout we
   *  started. `error` explains why such an event cannot be applied. */
  create: NewSubscription | { error: string };
}

export interface NewSubscription {
  userId: string;
  dodoCustomerId: string;
  dodoProductId: string;
  plan: PlanId;
  period: BillingPeriod;
}

/** A GitHub App webhook. `removedInstallation` is set for an uninstall. */
export interface GithubEvent {
  eventId: string;
  eventType: string;
  removedInstallation: string | null;
}

/** "duplicate" means the event id was already recorded and nothing changed. */
export type WebhookResult = "applied" | "duplicate";

/** Projects: the core of every store. `listForTeams` is how the dashboard
 *  finds them, so a store without the teams module still keeps each
 *  project's `teamId` as given. */
export interface ProjectStore {
  /** Newest first, each with its issue count and how many of those are
   *  feature requests. */
  listForTeams(
    teamIds: string[],
  ): Promise<Array<ProjectRecord & { issueCount: number; featureRequestCount: number }>>;
  create(input: Omit<ProjectRecord, "id" | "createdAt">): Promise<ProjectRecord>;
  get(id: string): Promise<ProjectRecord | null>;
  getByKey(key: ProjectKey): Promise<ProjectRecord | null>;
  update(id: string, patch: { name?: string; allowedOrigins?: string[] }): Promise<ProjectRecord | null>;
  /** Also removes its issues, and whatever the store's other modules keep
   *  for them (features, destinations, deliveries, activity). */
  delete(id: string): Promise<void>;
}

/** Issues: the core of every store. Triage and features change an issue
 *  through their own modules; without them an issue stays as created. */
export interface IssueStore {
  /** Newest first. */
  listForProject(projectId: string): Promise<IssueRecord[]>;
  get(id: string): Promise<IssueRecord | null>;
  create(input: NewIssue): Promise<void>;
  setTranscript(id: string, kind: "audio" | "video", outcome: TranscriptOutcome): Promise<void>;
}

/** Accounts and sign-in: Auth.js persistence (users, OAuth account links,
 *  magic-link tokens) and the sign-in code attempt counter. */
export interface AuthStore {
  adapter(): Adapter;
  /** Records an attempt for this email made `at`, and returns how many of
   *  its attempts fall at or after `since`, this one included. One atomic
   *  step, so attempts arriving together each get their own number. Keeps
   *  only the latest `keep` attempt times. Records nothing and returns 0
   *  when the email has no code pending, so attempts at addresses that never
   *  asked for a code store nothing. (auth/code-attempts.ts) */
  recordAttempt(identifier: string, attempt: { at: Date; since: Date; keep: number }): Promise<number>;
  /** Stores a new code for this email and deletes the ones before it, in one
   *  atomic step, so codes requested together still leave only one. */
  replaceCode(code: { identifier: string; token: string; expires: Date }): Promise<void>;
  /** Deletes every code still pending for this email. */
  revokeCodes(identifier: string): Promise<void>;
  /** Deletes this email's count. */
  forgetAttempts(identifier: string): Promise<void>;
}

/** Teams, their members and invites (ADR 0008). Members are Auth.js users,
 *  so a store with teams also has auth. */
export interface TeamStore {
  /** A new Team with `ownerId` as its Owner, in one step. */
  create(input: { name: string; ownerId: string }): Promise<TeamRecord>;
  get(id: string): Promise<TeamRecord | null>;
  rename(id: string, name: string): Promise<TeamRecord | null>;
  /** Every Team the user belongs to, oldest first, with their role in it. */
  listForUser(userId: string): Promise<Array<TeamRecord & { role: TeamRole }>>;
  membership(teamId: string, userId: string): Promise<TeamMemberRecord | null>;
  /** Oldest first. */
  members(teamId: string): Promise<TeamMemberProfile[]>;
  setRole(teamId: string, userId: string, role: TeamRole): Promise<MembershipChange>;
  removeMember(teamId: string, userId: string): Promise<MembershipChange>;

  /** Insert, or replace the invite already open for (team, email), which
   *  gets a new id: the old link stops working. */
  createInvite(input: Omit<TeamInviteRecord, "id" | "createdAt">): Promise<TeamInviteRecord>;
  getInvite(id: string): Promise<TeamInviteRecord | null>;
  /** Newest first, expired ones included. */
  listInvites(teamId: string): Promise<TeamInviteRecord[]>;
  /** Invites sent to this (lower-cased) address, expired ones included. */
  invitesForEmail(email: string): Promise<TeamInviteRecord[]>;
  revokeInvite(teamId: string, id: string): Promise<void>;
  /** Joins the user to the invite's Team with its role and deletes the
   *  invite, in one step, unless it is past `now`. Someone already a member
   *  keeps the role they have. */
  acceptInvite(id: string, userId: string, now: Date): Promise<InviteAcceptance>;
}

/** An issue's status, priority and close reason, and its activity log. */
export interface TriageStore {
  /** Applies one triage patch to every listed issue as `planTriageWrite`
   *  decides, atomically: the issues and their activity events are all
   *  written, or (when the patch is rejected for any of them) none are.
   *  Returns the issues that exist, after the change. */
  apply(ids: readonly string[], patch: IssueTriagePatch, actorId: string | null): Promise<IssueRecord[]>;
  /** Oldest first. */
  listEvents(issueId: string): Promise<IssueEventRecord[]>;
}

/** Features and the feature requests attached to them. */
export interface FeatureStore {
  /** Newest first, each with how many requests are attached. */
  listForProject(projectId: string): Promise<Array<FeatureRecord & { requestCount: number }>>;
  get(id: string): Promise<FeatureRecord | null>;
  /** Starts `under_review` unless a status is given. */
  create(input: {
    projectId: string;
    title: string;
    description: string | null;
    status?: FeatureStatus;
  }): Promise<FeatureRecord>;
  update(
    id: string,
    patch: { title?: string; description?: string | null; status?: FeatureStatus },
  ): Promise<FeatureRecord | null>;
  /** Its requests go back to waiting. */
  delete(id: string): Promise<void>;
  /** Moves every request of `fromId` onto `intoId` and deletes `fromId`, in
   *  one step: two features found to be the same thing become one. */
  merge(fromId: string, intoId: string): Promise<void>;
  /** Attach a feature request to a Feature, or with null send it back to
   *  waiting. The caller checks both belong to the same project. */
  attach(issueId: string, featureId: string | null): Promise<void>;
}

/** Connections to external tools, each project's destinations, and the
 *  deliveries of issues to them. */
export interface IntegrationStore {
  /** Newest first. */
  listConnections(teamId: string): Promise<ConnectionRecord[]>;
  getConnection(id: string): Promise<ConnectionRecord | null>;
  /** Insert, or replace the label, auth and credentials of the same (team,
   *  provider, externalId). Either way it ends up `active`: saving is how
   *  a connection is connected again. */
  saveConnection(input: Omit<ConnectionRecord, "id" | "createdAt" | "status">): Promise<ConnectionRecord>;
  setConnectionStatus(id: string, status: ConnectionStatus): Promise<void>;
  /** Also removes its destinations; their deliveries keep their links. */
  deleteConnection(id: string): Promise<void>;

  listDestinations(projectId: string): Promise<DestinationRecord[]>;
  /** One destination per (project, provider): insert or replace. */
  saveDestination(input: NewDestination): Promise<DestinationRecord>;
  deleteDestination(projectId: string, provider: IntegrationProvider): Promise<void>;
  /** A project's destinations with their connections; paused ones only on request. */
  deliveryTargets(
    projectId: string,
    opts: { includePaused: boolean },
  ): Promise<Array<{ destination: DestinationRecord; connection: ConnectionRecord }>>;

  listDeliveries(issueId: string): Promise<DeliveryRecord[]>;
  /**
   * Start one delivery as `pending`. Returns null when this (issue,
   * destination) already has one, which is the idempotency guard; with
   * `retry` the existing row is reset to pending instead.
   */
  claimDelivery(input: {
    issueId: string;
    destinationId: string;
    provider: IntegrationProvider;
    retry: boolean;
  }): Promise<DeliveryRecord | null>;
  /** Record the outcome and count the attempt. A failure keeps any earlier link. */
  finishDelivery(id: string, outcome: DeliveryOutcome): Promise<DeliveryRecord | null>;

  /** Records the GitHub App webhook's id and applies it atomically: a
   *  failure leaves no record, so the sender's retry is processed rather
   *  than skipped. */
  applyGithubEvent(event: GithubEvent): Promise<WebhookResult>;
}

/** Subscriptions, as Dodo's webhooks report them. */
export interface BillingStore {
  subscriptionFor(userId: string): Promise<SubscriptionRecord | null>;
  /** Records the webhook's id and applies it atomically: a failure leaves no
   *  record, so the sender's retry is processed rather than skipped. */
  applySubscriptionEvent(event: SubscriptionEvent): Promise<WebhookResult>;
}

/** The marketing site's early-access list. */
export interface WaitlistStore {
  /** Null when the email is already on the list. */
  add(email: string, source: string): Promise<WaitlistSignupRecord | null>;
  setEmailStatus(id: string, outcome: { status: "sent" } | { status: "failed"; error: string }): Promise<void>;
}

/** What every store implements: enough to receive reports and read them
 *  back. Files are not here; they go to `Storage`. */
export interface CoreStore {
  readonly projects: ProjectStore;
  readonly issues: IssueStore;
}

/** The parts a store may leave out. Each is all or nothing, and the backend
 *  serves only what the store has: no `features`, no feature routes. */
export interface StoreModules {
  readonly auth: AuthStore;
  readonly teams: TeamStore;
  readonly triage: TriageStore;
  readonly features: FeatureStore;
  readonly integrations: IntegrationStore;
  readonly billing: BillingStore;
  readonly waitlist: WaitlistStore;
}

export type StoreModule = keyof StoreModules;

/** Any store: the core, plus whichever modules it has. */
export type Store = CoreStore & Partial<StoreModules>;

/** A store with these modules, such as `StoreWith<"auth" | "teams">`. */
export type StoreWith<M extends StoreModule> = Store & Pick<StoreModules, M>;

/** A store with every module, as Postgres and Convex are. */
export type FullStore = CoreStore & StoreModules;
