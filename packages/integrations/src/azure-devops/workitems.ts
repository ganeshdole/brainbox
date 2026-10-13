import { errorMessage, type DeliveryResult, type Destination, type FetchLike } from "../destination.ts";
import { isRecord } from "../github/client.ts";
import { renderTicketHtml, type Ticket, type TicketFile } from "../ticket.ts";
import {
  AZURE_DEVOPS_URL,
  adoErrorMessage,
  adoRequest,
  adoUrl,
  authorizationHeader,
  listOf,
  str,
  type AzureDevopsAuth,
} from "./client.ts";

/** Where a work item's sprint comes from: a fixed path, or the team's current sprint at send time. */
export type AzureDevopsIteration = { path: string } | { currentFor: string };

export interface AzureDevopsWorkItemsOptions {
  organization: string;
  /** Project name or id. */
  project: string;
  /** "Bug", "Issue", "User Story", ... as the project's process names it. */
  workItemType: string;
  auth: AzureDevopsAuth;
  /** Puts the item on the team that owns this area. Omitted: the project root. */
  areaPath?: string;
  iteration?: AzureDevopsIteration;
  tags?: string[];
  /** 1 (highest) to 4. Only for types that have a Priority field. */
  priority?: number;
  /** Email or display name of the person to assign. */
  assignedTo?: string;
  /** Values for the process's own required fields, by reference name. */
  fields?: Record<string, string | number>;
  /** Where the report goes. Bugs read `Microsoft.VSTS.TCM.ReproSteps`. */
  bodyField?: string;
  /** Gets page, browser, viewport and locale on their own, e.g. `Microsoft.VSTS.TCM.SystemInfo`. */
  systemInfoField?: string;
  /** Azure DevOps Services by default. */
  baseUrl?: string;
  fetch?: FetchLike;
}

export const DESCRIPTION_FIELD = "System.Description";

/**
 * A destination that opens one Azure DevOps work item per ticket. The
 * screenshots are uploaded as attachments first, so the item and its images
 * are made in one call and never half-made.
 */
export function azureDevopsWorkItems(options: AzureDevopsWorkItemsOptions): Destination {
  return {
    kind: "azure-devops",
    async deliver(ticket: Ticket): Promise<DeliveryResult> {
      try {
        return await createWorkItem(options, ticket, false);
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }
    },
  };
}

export type ValidationResult = { ok: true } | { ok: false; status?: number; error: string };

/**
 * Runs every rule of the project's process against a sample item without
 * saving it: proves a configuration works before any report depends on it.
 */
export async function validateWorkItem(options: AzureDevopsWorkItemsOptions): Promise<ValidationResult> {
  const sample: Ticket = {
    id: "validation",
    createdAt: new Date(0).toISOString(),
    text: "Brainbox configuration check",
    metadata: {
      url: "https://brainbox.sh/",
      title: "Brainbox",
      viewport: { width: 1, height: 1 },
      devicePixelRatio: 1,
      userAgent: "Brainbox",
      language: "en",
      timezone: "UTC",
      consoleErrors: [],
    },
    links: { dashboard: "https://brainbox.sh/" },
  };
  try {
    const result = await createWorkItem(options, sample, true);
    return result.ok ? { ok: true } : result;
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

interface Uploaded {
  url: string;
  name: string;
}

async function createWorkItem(
  options: AzureDevopsWorkItemsOptions,
  ticket: Ticket,
  validateOnly: boolean,
): Promise<DeliveryResult> {
  let authorization: string;
  try {
    authorization = await authorizationHeader(options.auth);
  } catch (err) {
    return { ok: false, error: `token: ${errorMessage(err)}` };
  }
  const base = options.baseUrl ?? AZURE_DEVOPS_URL;
  const ctx = { base, authorization, options };

  const iteration = await iterationPath(ctx);
  if (!iteration.ok) return iteration;

  const crop = validateOnly ? null : await upload(ctx, ticket.files?.crop);
  const screenshot = validateOnly ? null : await upload(ctx, ticket.files?.screenshot);
  const rendered = renderTicketHtml(ticket, { imageUrl: crop?.url ?? screenshot?.url });

  const ops: PatchOp[] = [
    add("/fields/System.Title", rendered.title),
    add(`/fields/${options.bodyField ?? DESCRIPTION_FIELD}`, rendered.body),
  ];
  if (options.systemInfoField) ops.push(add(`/fields/${options.systemInfoField}`, rendered.environment));
  if (options.areaPath) ops.push(add("/fields/System.AreaPath", options.areaPath));
  if (iteration.path) ops.push(add("/fields/System.IterationPath", iteration.path));
  const tags = (options.tags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length > 0) ops.push(add("/fields/System.Tags", tags.join("; ")));
  if (options.priority !== undefined) ops.push(add("/fields/Microsoft.VSTS.Common.Priority", options.priority));
  if (options.assignedTo) ops.push(add("/fields/System.AssignedTo", options.assignedTo));
  for (const [field, value] of Object.entries(options.fields ?? {})) ops.push(add(`/fields/${field}`, value));
  for (const file of [crop, screenshot]) {
    if (file) ops.push(add("/relations/-", { rel: "AttachedFile", url: file.url, attributes: { comment: file.name } }));
  }
  if (!validateOnly) {
    ops.push(
      add("/relations/-", { rel: "Hyperlink", url: ticket.links.dashboard, attributes: { comment: "Brainbox report" } }),
    );
  }

  const url = adoUrl(
    base,
    [options.organization, options.project, `_apis/wit/workitems/$${encodeURIComponent(options.workItemType)}`],
    { validateOnly: validateOnly ? "true" : undefined },
  );
  let res;
  try {
    res = await adoRequest({
      method: "POST",
      url,
      authorization,
      body: ops,
      contentType: "application/json-patch+json",
      fetch: options.fetch,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  if (res.status !== 200) return { ok: false, status: res.status, error: adoErrorMessage(res.status, res.body) };
  if (validateOnly) return { ok: true, externalId: "", url: "" };

  const item = res.body;
  if (!isRecord(item) || typeof item.id !== "number") {
    return { ok: false, status: res.status, error: "Azure DevOps returned an unexpected work item body" };
  }
  const links = isRecord(item._links) && isRecord(item._links.html) ? str(item._links.html.href) : undefined;
  return {
    ok: true,
    externalId: String(item.id),
    url:
      links ??
      `${base}/${encodeURIComponent(options.organization)}/${encodeURIComponent(options.project)}/_workitems/edit/${item.id}`,
  };
}

interface Ctx {
  base: string;
  authorization: string;
  options: AzureDevopsWorkItemsOptions;
}

/** The team's current sprint, looked up at send time so it follows the sprint. None: no path is set. */
async function iterationPath(ctx: Ctx): Promise<{ ok: true; path?: string } | { ok: false; status?: number; error: string }> {
  const it = ctx.options.iteration;
  if (!it) return { ok: true };
  if ("path" in it) return { ok: true, path: it.path };
  const url = adoUrl(
    ctx.base,
    [ctx.options.organization, ctx.options.project, it.currentFor, "_apis/work/teamsettings/iterations"],
    { $timeframe: "current" },
  );
  let res;
  try {
    res = await adoRequest({ method: "GET", url, authorization: ctx.authorization, fetch: ctx.options.fetch });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
  // A team with no sprint running answers 404 or an empty list: the item goes to the backlog.
  if (res.status === 404) return { ok: true };
  if (res.status !== 200) return { ok: false, status: res.status, error: adoErrorMessage(res.status, res.body) };
  return { ok: true, path: str(listOf(res.body)[0]?.path) };
}

/** Uploads one image. A failure is not fatal: the body falls back to the public link. */
async function upload(ctx: Ctx, file: TicketFile | undefined): Promise<Uploaded | null> {
  if (!file) return null;
  try {
    const bytes = await file.load();
    const url = adoUrl(ctx.base, [ctx.options.organization, ctx.options.project, "_apis/wit/attachments"], {
      fileName: file.name,
    });
    const res = await adoRequest({
      method: "POST",
      url,
      authorization: ctx.authorization,
      body: bytes,
      contentType: "application/octet-stream",
      fetch: ctx.options.fetch,
    });
    const at = isRecord(res.body) ? str(res.body.url) : undefined;
    return (res.status === 200 || res.status === 201) && at ? { url: at, name: file.name } : null;
  } catch {
    return null;
  }
}

type PatchOp = { op: "add"; path: string; value: unknown };

function add(path: string, value: unknown): PatchOp {
  return { op: "add", path, value };
}
