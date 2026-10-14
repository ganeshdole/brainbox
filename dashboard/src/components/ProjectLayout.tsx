import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { LayoutGrid, Lightbulb, LogOut, Settings } from "lucide-react";
import type { Project } from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import { logout } from "../lib/logout";
import { ALL_PROJECTS, LAST_PROJECT_KEY, type ProjectOutletContext } from "../lib/useProject";
import { cn } from "../lib/utils";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Spinner } from "./ui/spinner";
import { UserMenu } from "./UserMenu";
import { Wordmark } from "./Wordmark";

function NavItem({
  to,
  active,
  icon,
  label,
  count,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition [&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "bg-interactive text-emphasis"
          : "text-muted hover:bg-interactive-hover hover:text-emphasis",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="font-mono text-xs text-muted">{count}</span>}
    </Link>
  );
}

function MobileTab({ to, active, label }: { to: string; active: boolean; label: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm transition",
        active
          ? "bg-interactive text-emphasis"
          : "text-muted hover:bg-interactive-hover hover:text-emphasis",
      )}
    >
      {label}
    </Link>
  );
}

/** Sidebar shell for everything inside one project. Fetches the project list
 *  once and hands the current project to child routes via outlet context. */
export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();
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

  // `/` forwards here next session
  useEffect(() => {
    if (projectId) localStorage.setItem(LAST_PROJECT_KEY, projectId);
  }, [projectId]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="text-center">
          <p className="text-sm text-error">{error}</p>
          <Link to="/" className="mt-2 inline-block text-sm text-link hover:underline">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }
  if (!projects) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <Spinner />
      </div>
    );
  }

  const isAll = projectId === ALL_PROJECTS;
  const project = isAll ? null : projects.find((p) => p.id === projectId);
  if (!isAll && !project) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="text-center">
          <p className="text-sm text-default">This project doesn't exist or isn't yours.</p>
          <Link to="/" className="mt-2 inline-block text-sm text-link hover:underline">
            Go to your projects
          </Link>
        </div>
      </div>
    );
  }

  const onCreated = (next: Project) =>
    setProjects((prev) => (prev ? [next, ...prev] : [next]));

  const base = `/projects/${project?.id ?? ALL_PROJECTS}`;
  const isSettings = location.pathname.endsWith("/settings");
  const isFeatures = location.pathname.startsWith(`${base}/features`);
  // Feature requests count under Features, not Reports.
  const bugCount = (p: Project) => (p.issueCount ?? 0) - (p.featureRequestCount ?? 0);
  const reportCount = project ? bugCount(project) : projects.reduce((n, p) => n + bugCount(p), 0);
  const context: ProjectOutletContext = {
    project: project ?? null,
    projects,
    setProject: (next) =>
      setProjects((prev) => prev?.map((p) => (p.id === next.id ? next : p)) ?? prev),
    removeProject: (id) =>
      setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev),
  };

  return (
    <div className="min-h-dvh bg-background lg:flex lg:h-dvh lg:overflow-hidden">
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-default">
        <div className="px-4 pb-4 pt-5">
          <Wordmark />
        </div>
        <div className="px-3">
          <ProjectSwitcher current={project ?? null} projects={projects} onCreated={onCreated} />
        </div>
        <nav className="mt-4 flex flex-col gap-0.5 px-3">
          <NavItem
            to={base}
            active={!isSettings && !isFeatures}
            icon={<LayoutGrid />}
            label="Reports"
            count={reportCount}
          />
          {project && (
            <NavItem
              to={`${base}/features`}
              active={isFeatures}
              icon={<Lightbulb />}
              label="Features"
              count={project.featureRequestCount}
            />
          )}
          {project && (
            <NavItem to={`${base}/settings`} active={isSettings} icon={<Settings />} label="Settings" />
          )}
        </nav>
        <div className="mt-auto border-t border-default p-2">
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="sticky top-0 z-10 border-b border-default bg-background/90 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <ProjectSwitcher current={project ?? null} projects={projects} onCreated={onCreated} />
            </div>
            <nav className="flex shrink-0 gap-1">
              <MobileTab to={base} active={!isSettings && !isFeatures} label="Reports" />
              {project && (
                <MobileTab to={`${base}/features`} active={isFeatures} label="Features" />
              )}
              {project && (
                <MobileTab to={`${base}/settings`} active={isSettings} label="Settings" />
              )}
            </nav>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              className="shrink-0 rounded-md p-1.5 text-muted transition hover:bg-interactive-hover hover:text-emphasis"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
