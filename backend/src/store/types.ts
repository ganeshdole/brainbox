import type { Adapter } from "@auth/core/adapters";
import type {
  BillingPeriod,
  CapturedMetadata,
  DeliveryStatus,
  DestinationConfig,
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

// The backend's whole view of persistence. Routes, auth, billing and delivery
// talk to a `Store`; which database sits behind it is a deployment choice
// (DATABASE_DRIVER). Every implementation must pass the same integration suite.
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
  /** The provider's id for the link, e.g. a GitHub App installation id. */
  externalId: string;
  label: string;
  createdAt: Date;
}

export interface DestinationRecord {
  id: string;
  projectId: string;
  connectionId: string;
  provider: IntegrationProvider;
  config: DestinationConfig;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface Store {
  readonly teams: {
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
  };

  readonly projects: {
    /** Newest first, each with its issue count and how many of those are
     *  feature requests. */
    listForTeams(
      teamIds: string[],
    ): Promise<Array<ProjectRecord & { issueCount: number; featureRequestCount: number }>>;
    create(input: Omit<ProjectRecord, "id" | "createdAt">): Promise<ProjectRecord>;
    get(id: string): Promise<ProjectRecord | null>;
    getByKey(key: ProjectKey): Promise<ProjectRecord | null>;
    update(
      id: string,
      patch: { name?: string; allowedOrigins?: string[] },
    ): Promise<ProjectRecord | null>;
    /** Also removes its issues, destinations and their deliveries. */
    delete(id: string): Promise<void>;
  };

  readonly issues: {
    /** Newest first. */
    listForProject(projectId: string): Promise<IssueRecord[]>;
    get(id: string): Promise<IssueRecord | null>;
    create(input: NewIssue): Promise<void>;
    setTranscript(id: string, kind: "audio" | "video", outcome: TranscriptOutcome): Promise<void>;
    /** Applies one triage patch to every listed issue as `planTriageWrite`
     *  decides, atomically: the issues and their activity events are all
     *  written, or (when the patch is rejected for any of them) none are.
     *  Returns the issues that exist, after the change. */
    triage(ids: readonly string[], patch: IssueTriagePatch, actorId: string | null): Promise<IssueRecord[]>;
    /** Oldest first. */
    listEvents(issueId: string): Promise<IssueEventRecord[]>;
    /** Attach a feature request to a Feature, or with null send it back to
     *  waiting. The caller checks both belong to the same project. */
    setFeature(id: string, featureId: string | null): Promise<void>;
  };

  readonly features: {
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
  };

  readonly integrations: {
    /** Newest first. */
    listConnections(teamId: string): Promise<ConnectionRecord[]>;
    getConnection(id: string): Promise<ConnectionRecord | null>;
    /** Insert, or refresh the label of the same (team, provider, externalId). */
    saveConnection(input: Omit<ConnectionRecord, "id" | "createdAt">): Promise<void>;
    /** Also removes its destinations; their deliveries keep their links. */
    deleteConnection(id: string): Promise<void>;

    listDestinations(projectId: string): Promise<DestinationRecord[]>;
    /** One destination per (project, provider): insert or replace. */
    saveDestination(
      input: Omit<DestinationRecord, "id" | "createdAt" | "updatedAt">,
    ): Promise<DestinationRecord>;
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
  };

  readonly billing: {
    subscriptionFor(userId: string): Promise<SubscriptionRecord | null>;
  };

  /** Each call records the event id and applies it atomically: a failure leaves
   *  no record, so the sender's retry is processed rather than skipped. */
  readonly webhooks: {
    applySubscriptionEvent(event: SubscriptionEvent): Promise<WebhookResult>;
    applyGithubEvent(event: GithubEvent): Promise<WebhookResult>;
  };

  readonly waitlist: {
    /** Null when the email is already on the list. */
    add(email: string, source: string): Promise<WaitlistSignupRecord | null>;
    setEmailStatus(
      id: string,
      outcome: { status: "sent" } | { status: "failed"; error: string },
    ): Promise<void>;
  };

  /** Attempts at sign-in codes, counted per email so guessing a code is
   *  capped (auth/code-attempts.ts). */
  readonly signIn: {
    /** Records an attempt for this email made `at`, and returns how many of
     *  its attempts fall at or after `since`, this one included. One atomic
     *  step, so attempts arriving together each get their own number. Keeps
     *  only the latest `keep` attempt times. Records nothing and returns 0
     *  when the email has no code pending, so attempts at addresses that never
     *  asked for a code store nothing. */
    recordAttempt(identifier: string, attempt: { at: Date; since: Date; keep: number }): Promise<number>;
    /** Stores a new code for this email and deletes the ones before it, in one
     *  atomic step, so codes requested together still leave only one. */
    replaceCode(code: { identifier: string; token: string; expires: Date }): Promise<void>;
    /** Deletes every code still pending for this email. */
    revokeCodes(identifier: string): Promise<void>;
    /** Deletes this email's count. */
    forgetAttempts(identifier: string): Promise<void>;
  };

  /** Auth.js persistence: users, OAuth account links and magic-link tokens. */
  authAdapter(): Adapter;
}
