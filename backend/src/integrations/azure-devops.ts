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

import { env } from "../env.ts";
import { connectionContext, openCredentials, sealCredentials, type SealedCredentials } from "../store/credentials.ts";
import type { ConnectionRecord } from "../store/index.ts";

// The backend's side of Azure DevOps: a connection's token, sealed at rest,
// and a stored destination turned into what @ganeshdole/brainbox-integrations
// sends. Connections are personal access tokens, one per organization per
// Team. Entra sign-in would add a second `auth` here, beside "pat".

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
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const org =
    host === "dev.azure.com"
      ? url.pathname.split("/").find(Boolean)
      : host.endsWith(".visualstudio.com")
        ? host.slice(0, -".visualstudio.com".length)
        : undefined;
  return org && name.test(decodeURIComponent(org)) ? decodeURIComponent(org) : null;
}

export function sealToken(conn: ConnectionIdentity, token: string): Promise<SealedCredentials> {
  return sealCredentials(token, { key: env.INTEGRATIONS_ENCRYPTION_KEY, context: connectionContext(conn) });
}

/** How to call Azure DevOps as this connection. Throws when it has no readable token. */
export async function authFor(conn: ConnectionRecord): Promise<AzureDevopsAuth> {
  if (!conn.credentials) throw new Error("the connection has no token");
  const pat = await openCredentials(conn.credentials, {
    key: env.INTEGRATIONS_ENCRYPTION_KEY,
    context: connectionContext(conn),
  });
  return { pat };
}

export function catalogFor(auth: AzureDevopsAuth): AzureDevopsCatalog {
  return azureDevops({ auth, baseUrl: env.AZURE_DEVOPS_URL });
}

/** A stored destination as the options `azureDevopsWorkItems()` takes. */
export function workItemsOptions(config: AzureDevopsDestinationConfig, auth: AzureDevopsAuth): AzureDevopsWorkItemsOptions {
  return {
    organization: config.organization,
    project: config.project.id,
    auth,
    areaPath: config.areaPath,
    ...(config.assignedTo && { assignedTo: config.assignedTo }),
    ...shapeOf(config.bug, config.team.id),
    feature: shapeOf(config.feature, config.team.id),
    baseUrl: env.AZURE_DEVOPS_URL,
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

export type PreparedDestination =
  | { ok: true; config: AzureDevopsDestinationConfig }
  | { ok: false; rejected: boolean; status: 422 | 502; error: string };

/**
 * What the dashboard picked, completed with what only Azure DevOps knows
 * (where each type's report goes, whether it has a Priority) and proved by a
 * dry-run create of each kind. `rejected`: the token no longer works.
 */
export async function prepareDestination(
  conn: ConnectionRecord,
  input: DestinationInputs["azure-devops"],
): Promise<PreparedDestination> {
  const auth = await authFor(conn);
  const organization = organizationOf(conn);
  let types: [AzureDevopsWorkItemTypeInfo, AzureDevopsWorkItemTypeInfo];
  try {
    const catalog = catalogFor(auth);
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
  const check = await validateWorkItem(workItemsOptions(config, auth));
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
