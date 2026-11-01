import { useEffect, useState, type FormEvent } from "react";
import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";
import { signIn } from "@hono/auth-js/react";
import { useLocation, useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import {
  codeSignInUrl,
  fetchSignInOptions,
  isSignInCode,
  normalizeEmail,
  savePendingSignIn,
  takePendingSignIn,
} from "../lib/sign-in";

type Status = "idle" | "sending" | "sent" | "error";

/**
 * Auth.js error codes, in our words.
 *
 * These used to be invisible: with no `pages.error` configured, Auth.js
 * rendered its own page on the API origin, so a failed sign-in ended at
 * app.brainbox.sh/api/auth/error showing a bare code. The backend now points
 * both signIn and error here, and this is what makes them mean something.
 */
const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Sign-in is misconfigured on our side. We've been notified - please try again shortly.",
  AccessDenied: "That address can't sign in here. Ask a team admin to invite you.",
  Verification: "That sign-in link or code has expired or was already used. Request a new one below.",
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Use the one you signed up with.",
  OAuthSignin: "Couldn't start sign-in with Google. Try again.",
  OAuthCallback: "Google couldn't complete the sign-in. Try again.",
  OAuthCreateAccount: "We couldn't create your account. Try again, or use email instead.",
  EmailCreateAccount: "We couldn't create your account. Try again, or use Google instead.",
  EmailSignin: "We couldn't send that sign-in link. Check the address and try again.",
  Callback: "Something went wrong finishing the sign-in. Try again.",
  SessionRequired: "Please sign in to continue.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const location = useLocation();
  const errorCode = params.get("error");

  // A wrong code comes back as ?error=Verification. When this tab sent it, go
  // straight back to the code step instead of starting over.
  const [retry] = useState(() => (errorCode === "Verification" ? takePendingSignIn() : null));
  const [email, setEmail] = useState(retry?.email ?? "");
  const [status, setStatus] = useState<Status>(retry ? "sent" : "idle");
  const [mode, setMode] = useState<EmailSignInMode>(retry ? "code" : "link");
  // Hidden only once the backend says it has no Google client.
  const [google, setGoogle] = useState(true);
  // Why the API refused to send, e.g. AccessDenied for an address outside
  // AUTH_ALLOWED_EMAIL_DOMAINS. Null when the send itself failed.
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    void fetchSignInOptions().then((options) => {
      setMode(options.email);
      setGoogle(options.google);
    });
  }, []);

  const errorMessage = retry
    ? "That code didn't work. Check it and try again. After five wrong codes, wait 15 minutes and send a new one."
    : errorCode
      ? (ERROR_MESSAGES[errorCode] ?? "Something went wrong signing in. Try again.")
      : null;
  const sendsCode = mode !== "link";
  // Google-only deployment (AUTH_EMAIL_MODE=off): no email form, no "or".
  const emailOff = mode === "off";

  // Where to land after signing in. ProtectedRoute stashes the page that
  // bounced us here, so a deep link - notably /claim?token=... after a purchase
  // - survives the round trip instead of dumping everyone on the dashboard root.
  // Back from a wrong code that state is gone, so the code sign-in kept it.
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  const callbackUrl =
    retry?.callbackUrl ??
    (from ? `${window.location.origin}${from.pathname}${from.search}` : window.location.origin);

  // Auth.js redirects here after a magic link is sent (pages.verifyRequest),
  // carrying ?provider=<id>&type=email from its own request. The normal path
  // never gets here - the form below uses redirect:false and shows the inbox
  // state inline - but a sign-in started anywhere else lands on it.
  const sentViaRedirect = params.get("type") === "email";

  async function sendEmail() {
    const address = email.trim();
    if (!address || status === "sending") return;
    setStatus("sending");
    try {
      // redirect:false keeps the user here so we can say "check your inbox"
      // rather than bouncing them to the Auth.js default verify-request page.
      // A refusal resolves rather than throws, with the reason in `error`.
      // Taking it for success told refused addresses a code was on its way.
      const result = await signIn("magic-link", { email: address, redirect: false, callbackUrl });
      if (result?.error) {
        setRefusal(result.error);
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setRefusal(null);
      setStatus("error");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendEmail();
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-default bg-elevated p-8">
          <img
            src="/assets/brainbox-logo.png"
            alt="Brainbox"
            className="h-9 w-9 object-contain"
            width={36}
            height={36}
          />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-emphasis">
            Welcome to Brainbox
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to read the feedback coming out of your app.
          </p>

          {errorMessage && (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-error-subtle bg-error px-4 py-3 text-sm text-error"
            >
              {errorMessage}
            </p>
          )}

          {google ? (
            <>
              <Button
                variant="secondary"
                className="mt-7 w-full"
                onClick={() => signIn("google", { callbackUrl })}
              >
                <GoogleMark />
                Continue with Google
              </Button>

              {!emailOff && (
                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-subtle" />
                  <span className="text-xs text-muted">or</span>
                  <span className="h-px flex-1 bg-subtle" />
                </div>
              )}
            </>
          ) : (
            // the same gap the Google button would have left
            <div className="mt-7" />
          )}

          {emailOff ? null : status === "sent" && sendsCode ? (
            <CodeForm
              email={email}
              alsoLink={mode === "both"}
              callbackUrl={callbackUrl}
              onResend={() => void sendEmail()}
              onChangeEmail={() => setStatus("idle")}
            />
          ) : status === "sent" || sentViaRedirect ? (
            <div
              role="status"
              className="rounded-lg border border-default bg-interactive px-4 py-3 text-sm text-emphasis"
            >
              {email ? (
                <>
                  Check <span className="font-medium">{email}</span> for a sign-in link.
                </>
              ) : (
                "Check your inbox for a sign-in link."
              )}{" "}
              It expires in 15 minutes.
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="mt-2 block text-xs text-muted underline underline-offset-4 hover:text-emphasis"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <label htmlFor="email" className="text-sm text-emphasis">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2"
              />
              <Button
                type="submit"
                className="mt-3 w-full"
                disabled={status === "sending" || !email.trim()}
              >
                {status === "sending" ? (
                  <Spinner />
                ) : sendsCode ? (
                  "Email me a sign-in code"
                ) : (
                  "Send me a sign-in link"
                )}
              </Button>
              {status === "error" && (
                <p role="alert" className="mt-3 text-sm text-error">
                  {refusal
                    ? (ERROR_MESSAGES[refusal] ?? "Something went wrong signing in. Try again.")
                    : "Couldn’t send the email. Try again, or use Google."}
                </p>
              )}
            </form>
          )}
        </div>

        {!emailOff && (
          <p className="mt-4 text-center text-xs text-muted">
            No password to remember. We&rsquo;ll email you a {sendsCode ? "code" : "link"} that signs
            you in.
          </p>
        )}
      </div>
    </div>
  );
}

interface CodeFormProps {
  email: string;
  /** The email has a sign-in link in it too ("both" mode). */
  alsoLink: boolean;
  callbackUrl: string;
  onResend: () => void;
  onChangeEmail: () => void;
}

/**
 * The step after a code is emailed. Submitting navigates to the API's sign-in
 * callback, the same one a link opens: a right code comes back signed in, a
 * wrong one comes back to /login?error=Verification, which reopens this step.
 */
function CodeForm({ email, alsoLink, callbackUrl, onResend, onChangeEmail }: CodeFormProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isSignInCode(code) || submitting) return;
    setSubmitting(true);
    savePendingSignIn({ email: normalizeEmail(email), callbackUrl });
    window.location.assign(codeSignInUrl(email, code, callbackUrl));
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p role="status" className="text-sm text-emphasis">
        We sent a 6-digit code to <span className="font-medium">{email}</span>
        {alsoLink ? ". Type it below, or open the link in the email." : "."} It expires in 15
        minutes.
      </p>
      <label htmlFor="code" className="mt-4 block text-sm text-emphasis">
        Code
      </label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="mt-2 font-mono tracking-[0.3em]"
      />
      <Button type="submit" className="mt-3 w-full" disabled={!isSignInCode(code) || submitting}>
        {submitting ? <Spinner /> : "Sign in"}
      </Button>
      <div className="mt-3 flex justify-between text-xs text-muted">
        <button
          type="button"
          onClick={onResend}
          className="underline underline-offset-4 hover:text-emphasis"
        >
          Send a new code
        </button>
        <button
          type="button"
          onClick={onChangeEmail}
          className="underline underline-offset-4 hover:text-emphasis"
        >
          Use a different email
        </button>
      </div>
    </form>
  );
}
