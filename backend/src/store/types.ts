import type { Adapter } from "@auth/core/adapters";
import type {
  BillingPeriod,
  CapturedMetadata,
  DeliveryStatus,
  DestinationConfig,
  IntegrationProvider,
  PlanId,
  ProjectKey,
  Region,
  SubscriptionStatus,
  TranscriptStatus,
} from "@ganeshdole/brainbox-shared";

// The backend's whole view of persistence. Routes, auth, billing and delivery
// talk to a `Store`; which database sits behind it is a deployment choice
// (DATABASE_DRIVER). Every implementation must pass the same integration suite.
//
// Records are plain objects with `Date` timestamps. Ids are strings the store
// assigns, except `issues.create`, whose id the caller picks so file keys can
// be built before the row exists.

export interface ProjectRecord {
  id: string;
  /** The Account (`users` row) that owns it. */
  ownerId: string;
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

/** A new issue. Transcripts arrive later through `issues.setTranscript`.
 *  `createdAt` defaults to now; set it only when importing existing issues. */
export type NewIssue = Omit<IssueRecord, "createdAt" | "audioTranscript" | "videoTranscript"> & {
  createdAt?: Date;
};

export interface ConnectionRecord {
  id: string;
  ownerId: string;
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
  readonly projects: {
    /** Newest first, each with its issue count. */
    listForOwner(ownerId: string): Promise<Array<ProjectRecord & { issueCount: number }>>;
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
  };

  readonly integrations: {
    /** Newest first. */
    listConnections(ownerId: string): Promise<ConnectionRecord[]>;
    getConnection(id: string): Promise<ConnectionRecord | null>;
    /** Insert, or refresh the label of the same (owner, provider, externalId). */
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
