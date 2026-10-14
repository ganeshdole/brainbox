import type { Ticket, TicketFile } from "@ganeshdole/brainbox-integrations";
import type {
  Delivery,
  Feature,
  IntegrationConnection,
  Issue,
  IssueEvent,
  Project,
  ProjectDestination,
  ProjectTeam,
  Team,
  TeamInvite,
  TeamMember,
  TeamRole,
} from "@ganeshdole/brainbox-shared";

import type { Storage } from "../storage/types.ts";
import { mimeForKey } from "../storage/mime.ts";
import type {
  ConnectionRecord as ConnectionRow,
  DeliveryRecord as DeliveryRow,
  DestinationRecord as DestinationRow,
  IssueEventRecord as IssueEventRow,
  FeatureRecord as FeatureRow,
  IssueRecord as IssueRow,
  ProjectRecord as ProjectRow,
  TeamInviteRecord as TeamInviteRow,
  TeamMemberProfile,
  TeamRecord as TeamRow,
} from "../store/types.ts";
import { inviteUrl } from "./teams.ts";

/** Map a DB issue row → the shared Issue, minting file URLs via storage. */
export async function toIssue(
  row: IssueRow,
  storage: Storage,
  deliveryRows?: DeliveryRow[],
): Promise<Issue> {
  const screenshot = row.screenshotKey
    ? { key: row.screenshotKey, url: await storage.presignGet(row.screenshotKey) }
    : undefined;
  const crop = row.cropKey
    ? { key: row.cropKey, url: await storage.presignGet(row.cropKey) }
    : undefined;
  const video = row.videoKey
    ? {
        key: row.videoKey,
        url: await storage.presignGet(row.videoKey),
        mime: row.videoMime ?? "video/webm",
        transcript: row.videoTranscript ?? undefined,
        transcriptStatus: row.videoTranscriptStatus ?? undefined,
      }
    : undefined;
  const session = row.sessionKey
    ? { key: row.sessionKey, url: await storage.presignGet(row.sessionKey) }
    : undefined;
  const audio = row.audioKey
    ? {
        key: row.audioKey,
        url: await storage.presignGet(row.audioKey),
        mime: row.audioMime ?? "application/octet-stream",
        transcript: row.audioTranscript ?? undefined,
        transcriptStatus: row.audioTranscriptStatus ?? undefined,
      }
    : undefined;
  return {
    id: row.id,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    priority: row.priority,
    closeReason: row.closeReason ?? undefined,
    statusChangedAt: row.statusChangedAt?.toISOString(),
    kind: row.kind,
    importance: row.importance ?? undefined,
    featureId: row.featureId ?? undefined,
    text: row.text ?? undefined,
    screenshot,
    crop,
    video,
    session,
    audio,
    region: row.region ?? undefined,
    metadata: row.metadata,
    ...(deliveryRows && { deliveries: deliveryRows.map(toDelivery) }),
  };
}

/** `names` maps actor ids to display names; an actor missing from it shows
 *  by id alone. */
export function toIssueEvent(row: IssueEventRow, names: ReadonlyMap<string, string>): IssueEvent {
  const name = row.actorId ? names.get(row.actorId) : undefined;
  return {
    id: row.id,
    issueId: row.issueId,
    kind: row.kind,
    from: row.from,
    to: row.to,
    ...(row.actorId && { actor: { id: row.actorId, ...(name && { name }) } }),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toFeature(row: FeatureRow, requestCount: number): Feature {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    requestCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `team` is the project's Team as the caller sees it. */
export function toProject(row: ProjectRow, team: ProjectTeam): Project {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    allowedOrigins: row.allowedOrigins,
    team,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTeam(row: TeamRow, role: TeamRole): Team {
  return { id: row.id, name: row.name, role, createdAt: row.createdAt.toISOString() };
}

export function toTeamMember(row: TeamMemberProfile): TeamMember {
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role,
    joinedAt: row.createdAt.toISOString(),
  };
}

export function toTeamInvite(row: TeamInviteRow, dashboardOrigin: string): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    url: inviteUrl(dashboardOrigin, row.id),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDelivery(row: DeliveryRow): Delivery {
  return {
    id: row.id,
    issueId: row.issueId,
    provider: row.provider,
    status: row.status,
    externalId: row.externalId ?? undefined,
    url: row.externalUrl ?? undefined,
    error: row.error ?? undefined,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDestination(row: DestinationRow): ProjectDestination {
  const { updatedAt, ...destination } = row;
  void updatedAt;
  return { ...destination, createdAt: row.createdAt.toISOString() };
}

/** Never the credentials: they stay in the backend. */
export function toConnection(row: ConnectionRow): IntegrationConnection {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    label: row.label,
    auth: row.auth,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TicketLinkOptions {
  dashboardOrigin: string;
  fileUrl: (key: string) => string;
  /** Reads a stored file, for trackers that keep their own copy. Without it
   *  the ticket carries links only. */
  loadFile?: (key: string) => Promise<Uint8Array>;
}

export function toTicket(row: IssueRow, links: TicketLinkOptions): Ticket {
  const { loadFile } = links;
  // Named as stored: screenshot.png, crop.png, recording.webm, audio.webm.
  const file = (key: string | null, contentType: string | null): TicketFile | undefined =>
    key && loadFile
      ? { name: key.split("/").pop() ?? key, contentType: contentType ?? mimeForKey(key), load: () => loadFile(key) }
      : undefined;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    kind: row.kind,
    importance: row.importance ?? undefined,
    text: row.text ?? undefined,
    transcript: row.audioTranscript ?? row.videoTranscript ?? undefined,
    metadata: row.metadata,
    region: row.region ?? undefined,
    links: {
      dashboard: `${links.dashboardOrigin}/projects/${row.projectId}/issues/${row.id}`,
      screenshot: row.screenshotKey ? links.fileUrl(row.screenshotKey) : undefined,
      crop: row.cropKey ? links.fileUrl(row.cropKey) : undefined,
      audio: row.audioKey ? links.fileUrl(row.audioKey) : undefined,
      video: row.videoKey ? links.fileUrl(row.videoKey) : undefined,
    },
    files: {
      screenshot: file(row.screenshotKey, "image/png"),
      crop: file(row.cropKey, "image/png"),
      audio: file(row.audioKey, row.audioMime),
      video: file(row.videoKey, row.videoMime),
    },
  };
}
