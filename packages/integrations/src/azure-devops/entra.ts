import { errorMessage, type FetchLike } from "../destination.ts";
import { base64url, fromBase64url, utf8 } from "../encoding.ts";
import { isRecord } from "../github/client.ts";
import { str } from "./client.ts";

/** Azure DevOps as an Entra resource: every permission the app registration grants. */
export const AZURE_DEVOPS_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
export const ENTRA_AUTHORITY = "https://login.microsoftonline.com";
const TIMEOUT_MS = 15_000;

export interface EntraAppOptions {
  clientId: string;
  clientSecret: string;
  /** Where Microsoft sends the browser back with `?code`. Must match the app registration. */
  redirectUri: string;
  /** "organizations" (any work or school account, the default), or one tenant id. */
  tenant?: string;
  authority?: string;
  fetch?: FetchLike;
  now?: () => number;
}

export interface EntraTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** From the ID token, present after a code exchange. */
  account?: EntraAccount;
}

export interface EntraAccount {
  tenantId: string;
  objectId: string;
  name?: string;
  username?: string;
}

/**
 * The OAuth error Microsoft returned. `code` is its `error` field:
 * `invalid_grant` means the refresh token is dead and the user must sign in again.
 */
export class EntraError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, description: string) {
    super(description || code || `Microsoft sign-in responded ${status}`);
    this.name = "EntraError";
    this.status = status;
    this.code = code;
  }
}

/** Delegated Azure DevOps access through a Microsoft Entra app. These throw `EntraError`. */
export interface EntraApp {
  authorizeUrl(params: { state: string; codeChallenge: string; loginHint?: string }): string;
  exchangeCode(code: string, codeVerifier: string): Promise<EntraTokens>;
  /** A fresh access token. Microsoft rotates the refresh token: store the new one. */
  refresh(refreshToken: string): Promise<EntraTokens>;
}

export function entraApp(options: EntraAppOptions): EntraApp {
  const now = options.now ?? Date.now;
  const root = `${options.authority ?? ENTRA_AUTHORITY}/${encodeURIComponent(options.tenant ?? "organizations")}/oauth2/v2.0`;
  const signInScope = `${AZURE_DEVOPS_SCOPE} offline_access openid profile email`;

  async function token(params: Record<string, string>, previous?: string): Promise<EntraTokens> {
    const doFetch = options.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${root}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          ...params,
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new EntraError(0, "network", errorMessage(err));
    }
    const body: unknown = await res.json().catch(() => null);
    const b = isRecord(body) ? body : {};
    const access = str(b.access_token);
    if (!res.ok || !access) {
      throw new EntraError(res.status, str(b.error) ?? "", firstLine(str(b.error_description) ?? ""));
    }
    const refresh = str(b.refresh_token) ?? previous;
    if (!refresh) throw new EntraError(res.status, "no_refresh_token", "Microsoft returned no refresh token");
    const expiresIn = typeof b.expires_in === "number" ? b.expires_in : Number(b.expires_in ?? 3600);
    const account = accountFrom(str(b.id_token));
    return {
      accessToken: access,
      refreshToken: refresh,
      expiresAt: now() + expiresIn * 1000,
      ...(account ? { account } : {}),
    };
  }

  return {
    authorizeUrl({ state, codeChallenge, loginHint }) {
      const url = new URL(`${root}/authorize`);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        response_type: "code",
        redirect_uri: options.redirectUri,
        response_mode: "query",
        scope: signInScope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString();
      return url.toString();
    },
    exchangeCode(code, codeVerifier) {
      return token({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: options.redirectUri,
        scope: signInScope,
      });
    },
    refresh(refreshToken) {
      return token(
        { grant_type: "refresh_token", refresh_token: refreshToken, scope: `${AZURE_DEVOPS_SCOPE} offline_access` },
        refreshToken,
      );
    },
  };
}

/** A PKCE verifier and its S256 challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", utf8(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/**
 * Who signed in, from the ID token's claims. Not signature-checked: it came
 * straight from Microsoft's token endpoint over TLS, which OpenID Connect
 * allows in place of validating it.
 */
function accountFrom(idToken: string | undefined): EntraAccount | undefined {
  const payload = idToken?.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (!isRecord(claims)) return undefined;
    const tenantId = str(claims.tid);
    const objectId = str(claims.oid);
    if (!tenantId || !objectId) return undefined;
    const name = str(claims.name);
    const username = str(claims.preferred_username) ?? str(claims.email);
    return { tenantId, objectId, ...(name ? { name } : {}), ...(username ? { username } : {}) };
  } catch {
    return undefined;
  }
}

/** Microsoft's descriptions carry trace and correlation ids on later lines. */
function firstLine(s: string): string {
  return s.split(/\r?\n/)[0]?.trim() ?? "";
}
