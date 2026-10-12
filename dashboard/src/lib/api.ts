import type {
  BillingPeriod,
  BillingState,
  Delivery,
  DestinationConfig,
  IntegrationProvider,
  IntegrationRepo,
  IntegrationsState,
  Issue,
  PlanId,
  Project,
  ProjectDestination,
  SignInOptions,
} from "@ganeshdole/brainbox-shared";

import { API_URL } from "./authConfig";

/**
 * Thrown when the request failed because the session is gone or unpaid, and a
 * redirect is already under way.
 *
 * Callers should swallow it rather than render it: the navigation is async, so
 * every `.catch` in the tree fires first and would paint an error the user sees
 * flash before the page changes. Use `isAuthRedirect()` to skip those.
 */
export class AuthRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthRedirectError";
  }
}

export function isAuthRedirect(err: unknown): boolean {
  return err instanceof AuthRedirectError;
}

// A page can have many requests in flight at once - the all-projects view fans
// out one per project - and a dead session fails all of them. Without this
// latch each one assigned window.location.href independently, so N failures
// meant N navigations and N error banners. The first one wins; the rest just
// throw so their callers unwind.
let redirecting = false;

function redirectOnce(to: string, message: string): never {
  if (!redirecting) {
    redirecting = true;
    window.location.href = to;
  }
  throw new AuthRedirectError(message);
}

/**
 * `redirects: false` is for public calls made before anyone is signed in: a
 * 401 or 402 then throws like any other error instead of navigating. The login
 * page needs it, since sending it to /login on a 401 would reload it forever.
 */
async function req<T>(path: string, init?: RequestInit, { redirects = true } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!redirects && !res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 401) {
    redirectOnce("/login", "Unauthorized");
  }
  // 402 means signed in but unpaid. Distinct from 401 so the user lands on the
  // plan picker instead of being bounced back through sign-in, which would
  // look like the login failed. /api/billing/* is never gated, so this cannot
  // loop.
  if (res.status === 402) {
    if (window.location.pathname.startsWith("/billing")) {
      throw new Error("Subscription required");
    }
    redirectOnce("/billing", "Subscription required");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Public: the login page reads it before anyone is signed in. A backend
  // older than this endpoint answers 401, which must not redirect.
  getSignInOptions: () => req<SignInOptions>("/api/sign-in-options", undefined, { redirects: false }),
  listProjects: () => req<Project[]>("/api/projects"),
  createProject: (body: { name: string; allowedOrigins?: string[] }) =>
    req<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  getProject: (id: string) => req<Project>(`/api/projects/${id}`),
  updateProject: (id: string, body: { name?: string; allowedOrigins?: string[] }) =>
    req<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) => req<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  listIssues: (id: string) => req<Issue[]>(`/api/projects/${id}/issues`),
  getIssue: (id: string) => req<Issue>(`/api/issues/${id}`),
  sendIssue: (id: string) => req<Delivery[]>(`/api/issues/${id}/deliveries`, { method: "POST" }),

  getIntegrations: () => req<IntegrationsState>("/api/integrations"),
  /** Returns the GitHub App install url to send the browser to. */
  startGithubInstall: (projectId: string) =>
    req<{ url: string }>("/api/integrations/github/install", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),
  listRepos: (connectionId: string) =>
    req<IntegrationRepo[]>(`/api/integrations/connections/${connectionId}/repos`),
  deleteConnection: (connectionId: string) =>
    req<{ ok: boolean }>(`/api/integrations/connections/${connectionId}`, { method: "DELETE" }),
  listDestinations: (projectId: string) =>
    req<ProjectDestination[]>(`/api/projects/${projectId}/destinations`),
  saveDestination: (
    projectId: string,
    provider: IntegrationProvider,
    body: { connectionId: string; config: DestinationConfig; enabled: boolean },
  ) =>
    req<ProjectDestination>(`/api/projects/${projectId}/destinations/${provider}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteDestination: (projectId: string, provider: IntegrationProvider) =>
    req<{ ok: boolean }>(`/api/projects/${projectId}/destinations/${provider}`, {
      method: "DELETE",
    }),

  getBillingState: () => req<BillingState>("/api/billing/subscription"),
  /** Returns the hosted Dodo checkout url to send the browser to. */
  startCheckout: (plan: PlanId, period: BillingPeriod) =>
    req<{ checkoutUrl: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan, period }),
    }),
};
