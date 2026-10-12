import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@hono/auth-js/react";
import type { Project } from "@brainbox-sh/shared";

import { Wordmark } from "../components/Wordmark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { api, isAuthRedirect } from "../lib/api";
import { logout } from "../lib/logout";
import { homeTarget, LAST_PROJECT_KEY } from "../lib/useProject";
import { normalizeOrigin } from "../lib/utils";

/** First-run screen: name the project, optionally lock it to a domain. */
function Onboarding() {
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
          Create your project
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
      </div>
    </div>
  );
}

/** `/` - forwards to the last-used project; shows onboarding when there are none. */
export function Home() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects()
      .then((next) => {
        if (!cancelled) setProjects(next);
      })
      .catch((e: Error) => {
        // A 401/402 is already navigating away; rendering it just flashes a
        // red banner over a page that is about to be replaced.
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      ) : projects?.length === 0 ? (
        <Onboarding />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
