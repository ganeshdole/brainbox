import { resolveToken, type FetchLike, type TokenSource } from "../destination.ts";
import { isRecord } from "../github/client.ts";

export const AZURE_DEVOPS_URL = "https://dev.azure.com";
/** Profiles and accounts live on a separate host from organizations. */
export const AZURE_DEVOPS_PROFILE_URL = "https://app.vssps.visualstudio.com";
export const API_VERSION = "7.1";
const TIMEOUT_MS = 15_000;

/**
 * How a call is authenticated. A personal access token goes as Basic auth; an
 * Entra access token as Bearer, resolved at send time so it is never stale.
 */
export type AzureDevopsAuth = { pat: string } | { bearer: TokenSource };

export async function authorizationHeader(auth: AzureDevopsAuth): Promise<string> {
  if ("pat" in auth) {
    if (!auth.pat) throw new Error("empty token");
    return `Basic ${btoa(`:${auth.pat}`)}`;
  }
  return `Bearer ${await resolveToken(auth.bearer)}`;
}

export interface AdoRequest {
  method: "GET" | "POST" | "PATCH";
  url: string;
  authorization: string;
  /** JSON, or raw bytes for an attachment upload. */
  body?: unknown;
  contentType?: string;
  fetch?: FetchLike;
}

export interface AdoResponse {
  status: number;
  body: unknown;
}

export class AzureDevopsApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(adoErrorMessage(status, body));
    this.name = "AzureDevopsApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Resolves on any status; throws only when fetch itself fails. A rejected
 * credential can come back as a 203 or a redirect to the sign-in page rather
 * than a 401, so both are reported as 401.
 */
export async function adoRequest(req: AdoRequest): Promise<AdoResponse> {
  const doFetch = req.fetch ?? fetch;
  const bytes = req.body instanceof Uint8Array;
  const res = await doFetch(req.url, {
    method: req.method,
    headers: {
      accept: "application/json",
      authorization: req.authorization,
      "x-tfs-fedauthredirect": "Suppress",
      ...(req.body !== undefined
        ? { "content-type": req.contentType ?? (bytes ? "application/octet-stream" : "application/json") }
        : {}),
    },
    body: req.body === undefined ? undefined : bytes ? (req.body as Uint8Array<ArrayBuffer>) : JSON.stringify(req.body),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 203 || (res.status >= 300 && res.status < 400)) {
    return { status: 401, body: { message: "Azure DevOps rejected the credentials" } };
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

/** GET a JSON body, throwing `AzureDevopsApiError` on anything but a 200. */
export async function adoGet(url: string, authorization: string, fetch?: FetchLike): Promise<unknown> {
  const res = await adoRequest({ method: "GET", url, authorization, fetch });
  if (res.status !== 200) throw new AzureDevopsApiError(res.status, res.body);
  return res.body;
}

export function adoErrorMessage(status: number, body: unknown): string {
  if (isRecord(body) && typeof body.message === "string" && body.message) return body.message;
  if (status === 401) return "Azure DevOps rejected the credentials";
  if (status === 403) return "The connected account can't do this in Azure DevOps";
  if (status === 404) return "Not found in Azure DevOps";
  if (status === 429) return "Azure DevOps is throttling requests; try again later";
  return `Azure DevOps responded ${status}`;
}

/** `{base}/{org}/{...segments}?api-version=7.1&{query}`, every segment encoded. */
export function adoUrl(
  base: string,
  segments: string[],
  query: Record<string, string | undefined> = {},
): string {
  const path = segments.map((s) => (s.startsWith("_apis") ? s : encodeURIComponent(s))).join("/");
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, v);
  params.set("api-version", API_VERSION);
  return `${base}/${path}?${params.toString()}`;
}

/** The `value` array of an Azure DevOps list response. */
export function listOf(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.value)) return [];
  return body.value.filter(isRecord);
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
