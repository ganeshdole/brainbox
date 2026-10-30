import { randomInt } from "node:crypto";
import Google from "@auth/core/providers/google";
import type { EmailConfig } from "@auth/core/providers/email";
import type { Context } from "hono";
import { env as runtimeEnv } from "hono/adapter";

import type { Deps, ResolvedAuth } from "../deps.ts";
import { magicLinkEmail } from "../email/templates/magic-link.ts";
import { signInCodeEmail } from "../email/templates/sign-in-code.ts";
import { AUTH_ERROR_PATH } from "../routes/auth-error.ts";
import { signInAllowed } from "./allowed.ts";
import { CODE_LIFETIME_MS, withCodeAttemptLimit } from "./code-attempts.ts";

/** A 6-digit sign-in code, zero-padded: every one of the million is equally likely. */
export function generateSignInCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// How long a sign-in link or code stays usable. Short enough that a forwarded
// or leaked mail stops working quickly, long enough to survive a slow inbox.
// The code attempt limit counts over the same span (code-attempts.ts).
const MAGIC_LINK_MAX_AGE_SECONDS = CODE_LIFETIME_MS / 1000;

// Extra fields captured from the Google profile and persisted on `users`.
declare module "@auth/core/types" {
  interface User {
    firstName?: string | null;
    lastName?: string | null;
  }
}
declare module "@auth/core/adapters" {
  interface AdapterUser {
    firstName?: string | null;
    lastName?: string | null;
  }
}

// Magic-link sign-in, declared inline rather than via the Nodemailer provider:
// that one hard-imports `nodemailer` and throws without an SMTP `server`, and
// we already have an Emailer abstraction (console in dev/test, Resend in prod)
// plus a Resend-verified domain. Auth.js treats any `type: "email"` provider
// generically, so this needs no extra dependency.
//
// Requires the store's Auth.js adapter to keep verification tokens.
//
// `emailMode` (AUTH_EMAIL_MODE) picks what the email carries. With "code" or
// "both" the verification token is a 6-digit code instead of Auth.js's
// 64-character one; the dashboard sends it to the same callback a link opens,
// so Auth.js checks both the same way. withCodeAttemptLimit caps guessing.
function magicLink(deps: Deps, auth: ResolvedAuth): EmailConfig {
  const sendsCode = auth.emailMode !== "link";
  const { replyTo } = deps.options;
  return {
    id: "magic-link",
    type: "email",
    name: "Email",
    maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    options: {},
    ...(sendsCode && { generateVerificationToken: generateSignInCode }),
    async sendVerificationRequest({ identifier, url, token }) {
      const minutes = MAGIC_LINK_MAX_AGE_SECONDS / 60;
      const { subject, html, text } = !sendsCode
        ? magicLinkEmail(url, minutes)
        : signInCodeEmail(token, auth.emailMode === "both" ? url : null, minutes);
      // Throwing here surfaces to the caller as a failed sign-in, which is what
      // we want: silently swallowing it would leave the user waiting for a mail
      // that is never coming.
      await deps.emailer.send({
        to: identifier,
        subject,
        html,
        text,
        ...(replyTo ? { replyTo } : {}),
      });
    },
  };
}

/**
 * The Auth.js config for an app, as initAuthConfig() wants it: built per
 * request. Auth.js reads AUTH_URL from the runtime's environment itself and
 * takes its base path from it; without one, it is mounted at /api/auth.
 */
export function createAuthConfig(deps: Deps, auth: ResolvedAuth) {
  return (c?: Context) => authConfig(deps, auth, c && !runtimeEnv(c).AUTH_URL ? "/api/auth" : undefined);
}

function authConfig(deps: Deps, auth: ResolvedAuth, basePath: string | undefined) {
  const { dashboardOrigin } = deps.options;
  return {
    secret: deps.options.secret,
    ...(basePath && { basePath }),
    trustHost: true,
    adapter: withCodeAttemptLimit(auth.store.adapter(), auth.store, auth.emailMode),

    // Auth.js otherwise renders its own unbranded pages on the API origin, so a
    // failed sign-in dropped the user on app.brainbox.sh/api/auth/error with a
    // bare error code and no way back. Every page leads to the dashboard's
    // /login, which reads ?error= and explains itself.
    // signIn and verifyRequest are used as given, so they are the dashboard URL.
    // error is not: when a sign-in step throws, Auth.js prefixes it with the
    // API's origin, so it is a path on the API that forwards to the dashboard
    // (routes/auth-error.ts).
    // Note none of these may carry a query string: Auth.js appends the incoming
    // request's own `?...` verbatim (lib/pages/index.js), so `/login?check=1`
    // would come out as `/login?check=1?provider=...` and parse as nonsense.
    // verifyRequest arrives with `?provider=<id>&type=email`, which is what the
    // login page keys its "check your inbox" state off.
    pages: {
      signIn: `${dashboardOrigin}/login`,
      error: AUTH_ERROR_PATH,
      verifyRequest: `${dashboardOrigin}/login`,
    },

    // Google only where it has a client: without one, its button would start a
    // sign-in that cannot finish.
    providers: [
      ...(auth.google ? [google(auth.google)] : []),
      magicLink(deps, auth),
    ],

    callbacks: {
      // allowedEmailDomains (AUTH_ALLOWED_EMAIL_DOMAINS). For email sign-in this runs before the
      // email is sent, so a refused address gets no mail. A refusal lands on
      // the login page as ?error=AccessDenied.
      async signIn({ user }: { user: { email?: string | null } }) {
        return signInAllowed(auth.store, deps.store.teams, user.email, auth.allowedEmailDomains);
      },

      // Auth.js's default drops any callbackUrl whose origin differs from the
      // API's, falling back to the API root. In production the dashboard and
      // the API share one host so it never showed; locally (5173 vs
      // 8787) it dumps every sign-in and sign-out on the bare API, and it would
      // break the moment the API moves to its own subdomain. Allow the
      // dashboard explicitly, and keep the default's caution for anything else.
      redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        try {
          const target = new URL(url);
          if (target.origin === baseUrl) return url;
          if (target.origin === new URL(dashboardOrigin).origin) return url;
        } catch {
          // Not a parseable URL - fall through to the safe default.
        }
        return dashboardOrigin;
      },
    },

    session: { strategy: "jwt" as const },
  };
}

function google(client: { clientId: string; clientSecret: string }) {
  return Google({
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    authorization: {
      params: {
        // Without this Google silently reuses whichever account is already
        // signed in there, so signing out of Brainbox and back in returns
        // you to the SAME account with no chooser - which reads as "log out
        // is broken". Forces the account picker every time.
        prompt: "select_account",
      },
    },
    // Lets someone who already has a `users` row (created by a magic-link
    // sign-in, a seed, or an import) sign in with Google on the same
    // address. Without it Auth.js refuses with OAuthAccountNotLinked and
    // dumps them on the error page with no way to recover.
    //
    // "dangerous" is about providers that do not verify addresses; Google
    // does, and the profile below only trusts it when email_verified holds.
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        firstName: profile.given_name ?? null,
        lastName: profile.family_name ?? null,
        email: profile.email,
        image: profile.picture,
      };
    },
  });
}
