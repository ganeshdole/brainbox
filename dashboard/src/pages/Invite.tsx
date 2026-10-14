import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSession } from "@hono/auth-js/react";
import type { ReceivedInvite } from "@ganeshdole/brainbox-shared";

import { Wordmark } from "../components/Wordmark";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { ApiError, api, isAuthRedirect } from "../lib/api";
import { landingFor } from "../lib/invites";
import { logout } from "../lib/logout";
import { inviteExpired, ROLE_LABELS } from "../lib/team";

type State =
  | { kind: "loading" }
  | { kind: "ready"; invite: ReceivedInvite }
  | { kind: "wrong_account"; email: string | null }
  | { kind: "gone"; message: string };

/** `/invite/:inviteId` - the link in an invite email. Signed-in only, and only
 *  the invited address can accept. */
export function Invite() {
  const { inviteId = "" } = useParams<{ inviteId: string }>();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getInvite(inviteId)
      .then((invite) => {
        if (!cancelled) setState({ kind: "ready", invite });
      })
      .catch((e: unknown) => {
        if (cancelled || isAuthRedirect(e)) return;
        if (e instanceof ApiError && e.body.code === "wrong_account") {
          setState({ kind: "wrong_account", email: e.body.email ?? null });
        } else {
          setState({ kind: "gone", message: (e as Error).message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const { teamId } = await api.acceptInvite(inviteId);
      navigate(await landingFor(teamId), { replace: true });
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
      setBusy(false);
    }
  }

  const me = session?.user?.email;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-default">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          {state.kind === "loading" && <Spinner />}

          {state.kind === "ready" &&
            (inviteExpired(state.invite.expiresAt) ? (
              <Message title="This invite has expired">
                Ask {state.invite.invitedBy ?? "the person who invited you"} to send a new one.
              </Message>
            ) : (
              <>
                <h1 className="text-xl font-semibold tracking-tight text-emphasis">
                  Join {state.invite.teamName}
                </h1>
                <p className="mt-2 text-sm text-muted">
                  {state.invite.invitedBy ? `${state.invite.invitedBy} invited you` : "You're invited"} as{" "}
                  {ROLE_LABELS[state.invite.role].toLowerCase()}. You'll see the team's projects and the reports
                  they receive.
                </p>
                <Button className="mt-8 w-full" onClick={() => void accept()} disabled={busy}>
                  {busy ? "Joining…" : `Join ${state.invite.teamName}`}
                </Button>
                {error && <p className="mt-3 text-sm text-error">{error}</p>}
              </>
            ))}

          {state.kind === "wrong_account" && (
            <Message title="This invite is for another address">
              {state.email ? `It was sent to ${state.email}` : "It was sent to someone else"}
              {me ? `, and you're signed in as ${me}.` : "."} Sign in with the invited address to accept it.
              <Button variant="secondary" className="mt-6 w-full" onClick={() => void logout()}>
                Sign out
              </Button>
            </Message>
          )}

          {state.kind === "gone" && (
            <Message title="This invite can't be used">
              {state.message}. Ask for a new invite, or{" "}
              <Link to="/" className="text-link hover:underline">
                go to your projects
              </Link>
              .
            </Message>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-emphasis">{title}</h1>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </>
  );
}
