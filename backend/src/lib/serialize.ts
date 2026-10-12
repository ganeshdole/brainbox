import type { Ticket } from "@ganeshdole/brainbox-integrations";
import type {
  Delivery,
  IntegrationConnection,
  Issue,
  Project,
  ProjectDestination,
} from "@ganeshdole/brainbox-shared";

import type { Storage } from "../storage/index.ts";
import type {
  ConnectionRecord as ConnectionRow,
  DeliveryRecord as DeliveryRow,
  DestinationRecord as DestinationRow,
  IssueRecord as IssueRow,
  ProjectRecord as ProjectRow,
} from "../store/index.ts";

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

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    allowedOrigins: row.allowedOrigins,
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
  return {
    id: row.id,
    projectId: row.projectId,
    connectionId: row.connectionId,
    provider: row.provider,
    config: row.config,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toConnection(row: ConnectionRow): IntegrationConnection {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface TicketLinkOptions {
  dashboardOrigin: string;
  fileUrl: (key: string) => string;
}

export function toTicket(row: IssueRow, links: TicketLinkOptions): Ticket {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    text: row.text ?? undefined,
    transcript: row.audioTranscript ?? row.videoTranscript ?? undefined,
    metadata: row.metadata,
    region: row.region ?? undefined,
    links: {
      dashboard: `${links.dashboardOrigin}/projects/${row.projectId}/issues/${row.id}`,
      screenshot: row.screenshotKey ? links.fileUrl(row.screenshotKey) : undefined,
      crop: row.cropKey ? links.fileUrl(row.cropKey) : undefined,
    },
  };
}
