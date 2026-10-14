import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@hono/auth-js/react";
import type { Project, ReceivedInvite, Team } from "@ganeshdole/brainbox-shared";

import { Wordmark } from "../components/Wordmark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { api, isAuthRedirect } from "../lib/api";
import { landingFor } from "../lib/invites";
import { logout } from "../lib/logout";
import { homeTarget, LAST_PROJECT_KEY } from "../lib/useProject";
import { onboardingTeam, ROLE_LABELS } from "../lib/team";
import { normalizeOrigin } from "../lib/utils";
import { useModules } from "../lib/modules";

/** First-run screen: name the project, optionally lock it to a domain. It goes
 *  into a Team the caller administers when they have one with no projects (all
 *  deleted, or joined before it had any); otherwise the API makes them one. */
function Onboarding({ teams }: { teams: Team[] }) {
  const into = onboardingTeam(teams);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const origin = domain.trim() ? normalizeOrigin(domain) : null;
    if (domain.trim() && !origin) {
      setError("Enter a domain like myapp.com or http://localhost:3000");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({
        name: name.trim(),
        ...(origin ? { allowedOrigins: [origin] } : {}),
        ...(into ? { teamId: into.id } : {}),
      });
      navigate(`/projects/${project.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-emphasis">
          <span className="h-2.5 w-2.5 rounded-full bg-background" />
        </span>
        <h1 className="mt-6 text-center text-xl font-semibold tracking-tight text-emphasis">
          {into ? `Create a project in ${into.name}` : "Create your project"}
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          One per site or app. You'll get the install snippet right after.
        </p>
        <form onSubmit={create} className="mt-8 space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name - e.g. Nidana"
            autoFocus
          />
          <Input
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setError(null);
            }}
            placeholder="Your app's domain (optional)"
            className="font-mono"
          />
          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create project"}
          </Button>
        </form>
        {error && <p className="mt-3 text-center text-sm text-error">{error}</p>}
        {teams.length > 0 && (
          <ul className="mt-8 space-y-1 border-t border-default pt-4 text-center text-xs text-muted">
            {teams.map((t) => (
              <li key={t.id}>
                <Link to={`/teams/${t.id}`} className="hover:text-emphasis">
                  Manage {t.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Invites waiting for the signed-in address, offered before anything else:
 *  someone invited to a Team should not be asked to create a project or pay. */
function PendingInvites({ invites, onSkip }: { invites: ReceivedInvite[]; onSkip: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(invite: ReceivedInvite) {
    setBusy(invite.id);
    setError(null);
    try {
      const { teamId } = await api.acceptInvite(invite.id);
      navigate(await landingFor(teamId), { replace: true });
    } catch (err) {
      if (!isAuthRedirect(err)) setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold tracking-tight text-emphasis">
          {invites.length === 1 ? "You're invited to a team" : "You're invited to teams"}
        </h1>
        <ul className="mt-8 space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-emphasis">{invite.teamName}</span>
                <span className="block truncate text-xs text-muted">
                  {ROLE_LABELS[invite.role]}
                  {invite.invitedBy ? `, invited by ${invite.invitedBy}` : ""}
                </span>
              </span>
              <Button size="sm" disabled={busy !== null} onClick={() => void join(invite)}>
                {busy === invite.id ? "Joining…" : "Join"}
              </Button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-3 text-center text-sm text-error">{error}</p>}
        <button
          type="button"
          onClick={onSkip}
          className="mx-auto mt-6 block text-xs text-muted transition hover:text-emphasis"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** `/` - offers pending invites, else forwards to the last-used project;
 *  shows onboarding when there are none. */
export function Home() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [invites, setInvites] = useState<ReceivedInvite[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const teamsOn = useModules().has("teams");

  // Invites first: they sit outside the paywall, and listing projects would
  // send someone with no plan of their own to checkout before they could join.
  useEffect(() => {
    let cancelled = false;
    // Without Teams there is nothing to be invited to.
    (teamsOn ? api.myInvites() : Promise.resolve([]))
      .then((next) => {
        if (!cancelled) setInvites(next);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setInvites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [teamsOn]);

  useEffect(() => {
    if (!invites || invites.length > 0) return;
    let cancelled = false;
    // Teams too: one may have no projects, and only these show it.
    Promise.all([api.listProjects(), teamsOn ? api.listTeams() : []])
      .then(([nextProjects, nextTeams]) => {
        if (cancelled) return;
        setTeams(nextTeams);
        setProjects(nextProjects);
      })
      .catch((e: Error) => {
        // A 401/402 is already navigating away; rendering it just flashes a
        // red banner over a page that is about to be replaced.
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [invites, teamsOn]);

  useEffect(() => {
    if (!projects) return;
    const to = homeTarget(projects, localStorage.getItem(LAST_PROJECT_KEY));
    if (to) navigate(to, { replace: true });
  }, [projects, navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-default">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-3">
            {session?.user && (
              <span className="hidden items-center gap-2 sm:flex">
                {session.user.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-6 rounded-full"
                  />
                )}
                <span className="text-xs text-muted">
                  {session.user.name ?? session.user.email}
                </span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-sm text-error">{error}</p>
        </div>
      ) : invites && invites.length > 0 ? (
        <PendingInvites invites={invites} onSkip={() => setInvites([])} />
      ) : projects?.length === 0 ? (
        <Onboarding teams={teams} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
