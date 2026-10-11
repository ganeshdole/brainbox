import type { FetchLike } from "../destination.ts";

export const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const TIMEOUT_MS = 15_000;

export interface GithubRequest {
  method: "GET" | "POST";
  path: string;
  token: string;
  body?: unknown;
  apiUrl?: string;
  fetch?: FetchLike;
}

export interface GithubResponse {
  status: number;
  body: unknown;
}

export class GithubApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(githubErrorMessage(status, body));
    this.name = "GithubApiError";
    this.status = status;
    this.body = body;
  }
}

/** Resolves on any status; throws only when fetch itself fails. */
export async function githubRequest(req: GithubRequest): Promise<GithubResponse> {
  const doFetch = req.fetch ?? fetch;
  const res = await doFetch(`${req.apiUrl ?? GITHUB_API}${req.path}`, {
    method: req.method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${req.token}`,
      "x-github-api-version": API_VERSION,
      "user-agent": "brainbox-integrations",
      ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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

export function githubErrorMessage(status: number, body: unknown): string {
  if (isRecord(body) && typeof body.message === "string") {
    const details = Array.isArray(body.errors)
      ? body.errors.map(describeError).filter((d): d is string => d !== null)
      : [];
    return details.length > 0 ? `${body.message}: ${details.join("; ")}` : body.message;
  }
  return `GitHub responded ${status}`;
}

function describeError(e: unknown): string | null {
  if (!isRecord(e)) return null;
  if (typeof e.message === "string") return e.message;
  const field = typeof e.field === "string" ? e.field : null;
  const code = typeof e.code === "string" ? e.code : null;
  if (field && code) return `${field} ${code}`;
  return code ?? field;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
