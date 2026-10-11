import type { FetchLike } from "../destination.ts";
import { base64url, pemToDer, utf8 } from "../encoding.ts";
import { GithubApiError, githubRequest, isRecord } from "./client.ts";

export interface GithubAppOptions {
  appId: string;
  /** PKCS#8 PEM. GitHub downloads PKCS#1; convert with `openssl pkcs8 -topk8 -nocrypt`. */
  privateKey: string;
  /** Needed only for `userToken`: the app's OAuth client id and secret. */
  clientId?: string;
  clientSecret?: string;
  fetch?: FetchLike;
  apiUrl?: string;
  /** Where `/login/oauth` lives. Defaults to https://github.com. */
  webUrl?: string;
  now?: () => number;
}

export interface GithubInstallation {
  id: number;
  account: { login: string; type: string };
}

export interface GithubRepo {
  id: number;
  name: string;
  owner: string;
  fullName: string;
  private: boolean;
}

/** App-level GitHub calls. These throw `GithubApiError`; a failure here is configuration, not a ticket. */
export interface GithubApp {
  appJwt(): Promise<string>;
  installationToken(installationId: string | number): Promise<string>;
  installation(installationId: string | number): Promise<GithubInstallation>;
  installationRepos(installationId: string | number): Promise<GithubRepo[]>;
  /** Exchanges the `code` GitHub sends after install for a user token. */
  userToken(code: string): Promise<string>;
  /** The installations of this app the user can access; proves an install is theirs. */
  userInstallations(userToken: string): Promise<GithubInstallation[]>;
}

type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const JWT_TTL_SEC = 9 * 60;
const JWT_BACKDATE_SEC = 60;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REPOS_PER_PAGE = 100;
const REPOS_MAX_PAGES = 10;

export function githubApp(options: GithubAppOptions): GithubApp {
  const now = options.now ?? Date.now;
  const common = { apiUrl: options.apiUrl, fetch: options.fetch };

  let key: Promise<SigningKey> | null = null;
  function signingKey(): Promise<SigningKey> {
    key ??= crypto.subtle.importKey(
      "pkcs8",
      pemToDer(options.privateKey, "PRIVATE KEY"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return key;
  }

  async function appJwt(): Promise<string> {
    const nowSec = Math.floor(now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iat: nowSec - JWT_BACKDATE_SEC,
        exp: nowSec + JWT_TTL_SEC,
        iss: options.appId,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      await signingKey(),
      utf8(signingInput),
    );
    return `${signingInput}.${base64url(new Uint8Array(signature))}`;
  }

  const tokens = new Map<string, { token: string; expiresAt: number }>();

  async function installationToken(installationId: string | number): Promise<string> {
    const id = String(installationId);
    const cached = tokens.get(id);
    if (cached && cached.expiresAt - now() > TOKEN_REFRESH_MARGIN_MS) return cached.token;

    const res = await githubRequest({
      method: "POST",
      path: `/app/installations/${encodeURIComponent(id)}/access_tokens`,
      token: await appJwt(),
      ...common,
    });
    if (res.status !== 201) throw new GithubApiError(res.status, res.body);
    const body = res.body;
    if (!isRecord(body) || typeof body.token !== "string" || typeof body.expires_at !== "string") {
      throw new Error("GitHub returned an unexpected installation token body");
    }
    tokens.set(id, { token: body.token, expiresAt: Date.parse(body.expires_at) });
    return body.token;
  }

  async function installation(installationId: string | number): Promise<GithubInstallation> {
    const res = await githubRequest({
      method: "GET",
      path: `/app/installations/${encodeURIComponent(String(installationId))}`,
      token: await appJwt(),
      ...common,
    });
    if (res.status !== 200) throw new GithubApiError(res.status, res.body);
    const found = toInstallation(res.body);
    if (!found) throw new Error("GitHub returned an unexpected installation body");
    return found;
  }

  async function installationRepos(installationId: string | number): Promise<GithubRepo[]> {
    const token = await installationToken(installationId);
    const repos: GithubRepo[] = [];
    for (let page = 1; page <= REPOS_MAX_PAGES; page++) {
      const res = await githubRequest({
        method: "GET",
        path: `/installation/repositories?per_page=${REPOS_PER_PAGE}&page=${page}`,
        token,
        ...common,
      });
      if (res.status !== 200) throw new GithubApiError(res.status, res.body);
      const body = res.body;
      if (!isRecord(body) || !Array.isArray(body.repositories)) {
        throw new Error("GitHub returned an unexpected repositories body");
      }
      for (const r of body.repositories) {
        const repo = toRepo(r);
        if (repo) repos.push(repo);
      }
      const total = typeof body.total_count === "number" ? body.total_count : repos.length;
      if (body.repositories.length < REPOS_PER_PAGE || repos.length >= total) break;
    }
    return repos;
  }

  async function userToken(code: string): Promise<string> {
    if (!options.clientId || !options.clientSecret) {
      throw new Error("githubApp: userToken needs clientId and clientSecret");
    }
    const doFetch = options.fetch ?? fetch;
    const res = await doFetch(`${options.webUrl ?? "https://github.com"}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await res.json().catch(() => null);
    if (isRecord(body) && typeof body.access_token === "string") return body.access_token;
    const reason =
      isRecord(body) && typeof body.error_description === "string"
        ? body.error_description
        : `GitHub responded ${res.status}`;
    throw new GithubApiError(res.status, { message: reason });
  }

  async function userInstallations(token: string): Promise<GithubInstallation[]> {
    const found: GithubInstallation[] = [];
    for (let page = 1; page <= REPOS_MAX_PAGES; page++) {
      const res = await githubRequest({
        method: "GET",
        path: `/user/installations?per_page=${REPOS_PER_PAGE}&page=${page}`,
        token,
        ...common,
      });
      if (res.status !== 200) throw new GithubApiError(res.status, res.body);
      const body = res.body;
      if (!isRecord(body) || !Array.isArray(body.installations)) {
        throw new Error("GitHub returned an unexpected installations body");
      }
      for (const i of body.installations) {
        const inst = toInstallation(i);
        if (inst) found.push(inst);
      }
      if (body.installations.length < REPOS_PER_PAGE) break;
    }
    return found;
  }

  return {
    appJwt,
    installationToken,
    installation,
    installationRepos,
    userToken,
    userInstallations,
  };
}

function toInstallation(body: unknown): GithubInstallation | null {
  const account = isRecord(body) ? body.account : undefined;
  if (!isRecord(body) || typeof body.id !== "number" || !isRecord(account)) return null;
  if (typeof account.login !== "string") return null;
  return {
    id: body.id,
    account: {
      login: account.login,
      type: typeof account.type === "string" ? account.type : "User",
    },
  };
}

function toRepo(r: unknown): GithubRepo | null {
  if (!isRecord(r) || typeof r.id !== "number" || typeof r.name !== "string") return null;
  if (typeof r.full_name !== "string" || !isRecord(r.owner) || typeof r.owner.login !== "string") {
    return null;
  }
  return {
    id: r.id,
    name: r.name,
    owner: r.owner.login,
    fullName: r.full_name,
    private: r.private === true,
  };
}
