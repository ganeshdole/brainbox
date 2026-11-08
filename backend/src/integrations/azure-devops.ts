import {
  AzureDevopsApiError,
  azureDevops,
  validateWorkItem,
  type AzureDevopsAuth,
  type AzureDevopsCatalog,
  type AzureDevopsWorkItemShape,
  type AzureDevopsWorkItemsOptions,
} from "@ganeshdole/brainbox-integrations";
import type {
  AzureDevopsDestinationConfig,
  AzureDevopsWorkItemConfig,
  AzureDevopsWorkItemTypeInfo,
  DestinationInputs,
} from "@ganeshdole/brainbox-shared";

import {
  connectionContext,
  openCredentials,
  sealCredentials,
  UnreadableCredentialsError,
  type SealedCredentials,
} from "../store/credentials.ts";
import type { ConnectionRecord } from "../store/types.ts";

// The backend's side of Azure DevOps: a connection's token, sealed at rest,
// and a stored destination turned into what @ganeshdole/brainbox-integrations
// sends. Connections are personal access tokens, one per organization per
// Team. Entra sign-in would add a second `auth` here, beside "pat".

/** What Azure DevOps needs from a deployment. */
export interface AzureDevopsSettings {
  /** Seals stored tokens: 32 bytes, base64 (`openssl rand -base64 32`).
   *  Changing it makes every stored token unreadable. */
  encryptionKey: string;
  /** Azure DevOps Services (https://dev.azure.com) unless set, e.g. to the
   *  local fake. */
  url?: string;
}

const AZURE_DEVOPS_URL = "https://dev.azure.com";

type ConnectionIdentity = Pick<ConnectionRecord, "teamId" | "provider" | "externalId">;

/** A PAT connection's external id: one connection per organization per Team. */
export function patExternalId(organization: string): string {
  return `pat:${organization.toLowerCase()}`;
}

/** The organization a connection reaches: a PAT connection is labelled with it. */
export function organizationOf(conn: ConnectionRecord): string {
  return conn.label;
}

/**
 * The organization in what someone pastes: `https://dev.azure.com/acme/...`,
 * `https://acme.visualstudio.com`, or just `acme`. Null when it is none of those.
 */
export function parseOrganization(input: string): string | null {
  const value = input.trim();
  const name = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/;
  if (name.test(value)) return value;
  let org: string | undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase();
    const segment = url.pathname.split("/").find(Boolean);
    // decodeURIComponent throws on a malformed escape like %ZZ: that's not an organization either.
    org =
      host === "dev.azure.com"
        ? segment && decodeURIComponent(segment)
        : host.endsWith(".visualstudio.com")
          ? host.slice(0, -".visualstudio.com".length)
          : undefined;
  } catch {
    return null;
  }
  return org && name.test(org) ? org : null;
}

export function sealToken(
  settings: AzureDevopsSettings,
  conn: ConnectionIdentity,
  token: string,
): Promise<SealedCredentials> {
  return sealCredentials(token, { key: settings.encryptionKey, context: connectionContext(conn) });
}

/** How to call Azure DevOps as this connection. Throws
 *  `UnreadableCredentialsError` when it has no readable token. */
export async function authFor(settings: AzureDevopsSettings, conn: ConnectionRecord): Promise<AzureDevopsAuth> {
  if (!conn.credentials) throw new UnreadableCredentialsError("the connection has no token");
  const pat = await openCredentials(conn.credentials, {
    key: settings.encryptionKey,
    context: connectionContext(conn),
  });
  return { pat };
}

export function catalogFor(settings: AzureDevopsSettings, auth: AzureDevopsAuth): AzureDevopsCatalog {
  return azureDevops({ auth, baseUrl: settings.url ?? AZURE_DEVOPS_URL });
}

/** A stored destination as the options `azureDevopsWorkItems()` takes. */
export function workItemsOptions(
  settings: AzureDevopsSettings,
  config: AzureDevopsDestinationConfig,
  auth: AzureDevopsAuth,
): AzureDevopsWorkItemsOptions {
  return {
    organization: config.organization,
    project: config.project.id,
    auth,
    areaPath: config.areaPath,
    ...(config.assignedTo && { assignedTo: config.assignedTo }),
    ...shapeOf(config.bug, config.team.id),
    feature: shapeOf(config.feature, config.team.id),
    baseUrl: settings.url ?? AZURE_DEVOPS_URL,
  };
}

function shapeOf(item: AzureDevopsWorkItemConfig, team: string): AzureDevopsWorkItemShape {
  return {
    workItemType: item.type,
    bodyField: item.bodyField,
    ...(item.systemInfoField && { systemInfoField: item.systemInfoField }),
    iteration: item.iteration.kind === "current" ? { currentFor: team } : { path: item.iteration.path },
    tags: item.tags,
    ...(item.priority !== undefined && { priority: item.priority }),
    fields: Object.fromEntries(item.fields.map((f) => [f.referenceName, f.value])),
  };
}

/**
 * What to say when a stored token can't be opened. Most likely the deployment's
 * INTEGRATIONS_ENCRYPTION_KEY isn't the one the token was sealed with, which
 * restoring the key fixes, so the connection is NOT marked as needing a new
 * token: that would outlive the key being put back.
 */
export const UNREADABLE_TOKEN =
  "Brainbox can't read the stored Azure DevOps token: INTEGRATIONS_ENCRYPTION_KEY is not the key it was saved with. " +
  "Restore that key, or connect Azure DevOps again in Settings.";

/** Logs, loudly, a token that can't be opened: an operator has to act. */
export function reportUnreadableToken(conn: Pick<ConnectionRecord, "id">, err: unknown): void {
  console.error(
    `[integrations] CANNOT READ the token of Azure DevOps connection ${conn.id}. ` +
      "Check INTEGRATIONS_ENCRYPTION_KEY: it must be the key the token was sealed with.",
    err instanceof Error ? err.message : err,
  );
}

export type PreparedDestination =
  | { ok: true; config: AzureDevopsDestinationConfig }
  | { ok: false; rejected: false; unreadable: true; status: 409; error: string }
  | { ok: false; rejected: boolean; unreadable?: false; status: 422 | 502; error: string };

/**
 * What the dashboard picked, completed with what only Azure DevOps knows
 * (where each type's report goes, whether it has a Priority) and proved by a
 * dry-run create of each kind. `rejected`: the token no longer works.
 * `unreadable`: the stored token can't be opened (`UNREADABLE_TOKEN`).
 */
export async function prepareDestination(
  settings: AzureDevopsSettings,
  conn: ConnectionRecord,
  input: DestinationInputs["azure-devops"],
): Promise<PreparedDestination> {
  let auth: AzureDevopsAuth;
  try {
    auth = await authFor(settings, conn);
  } catch (err) {
    if (!(err instanceof UnreadableCredentialsError)) throw err;
    reportUnreadableToken(conn, err);
    return { ok: false, rejected: false, unreadable: true, status: 409, error: UNREADABLE_TOKEN };
  }
  const organization = organizationOf(conn);
  let types: [AzureDevopsWorkItemTypeInfo, AzureDevopsWorkItemTypeInfo];
  try {
    const catalog = catalogFor(settings, auth);
    types = await Promise.all([
      catalog.workItemType(organization, input.project.id, input.bug.type),
      catalog.workItemType(organization, input.project.id, input.feature.type),
    ]);
  } catch (err) {
    if (!(err instanceof AzureDevopsApiError)) throw err;
    return { ok: false, rejected: err.status === 401, status: err.status === 404 ? 422 : 502, error: err.message };
  }
  const [bug, feature] = types;
  const config: AzureDevopsDestinationConfig = {
    ...input,
    organization,
    bug: completed(input.bug, bug),
    feature: completed(input.feature, feature),
  };
  const check = await validateWorkItem(workItemsOptions(settings, config, auth));
  if (check.ok) return { ok: true, config };
  return {
    ok: false,
    rejected: check.status === 401,
    status: check.status === 400 || check.status === 404 ? 422 : 502,
    error: check.error,
  };
}

function completed(
  item: DestinationInputs["azure-devops"]["bug"],
  info: AzureDevopsWorkItemTypeInfo,
): AzureDevopsWorkItemConfig {
  const { priority, ...rest } = item;
  return {
    ...rest,
    ...(info.hasPriority && priority !== undefined && { priority }),
    bodyField: info.bodyField,
    ...(info.systemInfoField && { systemInfoField: info.systemInfoField }),
  };
}
