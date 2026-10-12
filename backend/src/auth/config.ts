import Google from "@auth/core/providers/google";
import type { EmailConfig } from "@auth/core/providers/email";

import { getEmailer } from "../email/index.ts";
import { magicLinkEmail } from "../email/templates/magic-link.ts";
import { env } from "../env.ts";
import { AUTH_ERROR_PATH } from "../routes/auth-error.ts";
import { getStore } from "../store/index.ts";

// How long a sign-in link stays usable. Short enough that a forwarded or
// leaked mail stops working quickly, long enough to survive a slow inbox.
const MAGIC_LINK_MAX_AGE_SECONDS = 15 * 60;

// Magic-link sign-in, declared inline rather than via the Nodemailer provider:
// that one hard-imports `nodemailer` and throws without an SMTP `server`, and
// we already have an Emailer abstraction (console in dev/test, Resend in prod)
// plus a Resend-verified domain. Auth.js treats any `type: "email"` provider
// generically, so this needs no extra dependency.
//
// Requires the store's Auth.js adapter to keep verification tokens.
const magicLink: EmailConfig = {
  id: "magic-link",
  type: "email",
  name: "Email",
  from: env.EMAIL_FROM,
  maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    const { subject, html, text } = magicLinkEmail(url, MAGIC_LINK_MAX_AGE_SECONDS / 60);
    // Throwing here surfaces to the caller as a failed sign-in, which is what
    // we want: silently swallowing it would leave the user waiting for a mail
    // that is never coming.
    await getEmailer().send({
      to: identifier,
      subject,
      html,
      text,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    });
  },
};

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

// Passed to initAuthConfig(); it invokes this per request (the Context arg is
// unused - all config comes from `env`, since `c.env` is empty on Node).
export function getAuthConfig() {
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    adapter: getStore().authAdapter(),

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
      signIn: `${env.DASHBOARD_ORIGIN}/login`,
      error: AUTH_ERROR_PATH,
      verifyRequest: `${env.DASHBOARD_ORIGIN}/login`,
    },

    providers: [
      Google({
        clientId: env.GOOGLE_ID,
        clientSecret: env.GOOGLE_SECRET,
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
      }),
      magicLink,
    ],

    callbacks: {
      // Auth.js's default drops any callbackUrl whose origin differs from the
      // API's, falling back to the API root. In production the dashboard and
      // the API share app.brainbox.sh so it never showed; locally (5173 vs
      // 8787) it dumps every sign-in and sign-out on the bare API, and it would
      // break the moment the API moves to its own subdomain. Allow the
      // dashboard explicitly, and keep the default's caution for anything else.
      redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        try {
          const target = new URL(url);
          if (target.origin === baseUrl) return url;
          if (target.origin === new URL(env.DASHBOARD_ORIGIN).origin) return url;
        } catch {
          // Not a parseable URL - fall through to the safe default.
        }
        return env.DASHBOARD_ORIGIN;
      },
    },

    session: { strategy: "jwt" as const },
  };
}
