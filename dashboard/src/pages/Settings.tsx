import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { Project } from "@brainbox-sh/shared";

import { CopyButton } from "../components/CopyButton";
import { DomainsEditor } from "../components/DomainsEditor";
import { Eyebrow } from "../components/Eyebrow";
import { GithubDestination } from "../components/GithubDestination";
import { InstallSnippet } from "../components/InstallSnippet";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { LAST_PROJECT_KEY, useProject } from "../lib/useProject";

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <Eyebrow className="block">{label}</Eyebrow>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DangerZone({
  project,
  projects,
  onDeleted,
}: {
  project: Project;
  projects: Project[];
  onDeleted: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function destroy(e: React.FormEvent) {
    e.preventDefault();
    if (name !== project.name) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(project.id);
      localStorage.removeItem(LAST_PROJECT_KEY);
      const next = projects.find((p) => p.id !== project.id);
      onDeleted(project.id);
      navigate(next ? `/projects/${next.id}` : "/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-default bg-elevated px-4 py-3.5">
      {confirming ? (
        <form onSubmit={destroy} className="space-y-3">
          <p className="text-sm text-default">
            Type <span className="font-medium text-emphasis">{project.name}</span> to confirm.
            All of its reports go with it.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={project.name}
            autoFocus
            disabled={busy}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={busy || name !== project.name}
              className="text-error hover:text-error"
            >
              {busy ? "Deleting…" : "Delete this project"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-default">Delete this project and all its reports.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-error hover:text-error"
            onClick={() => setConfirming(true)}
          >
            Delete project
          </Button>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { project, projects, setProject, removeProject } = useProject();

  // Settings are per-project; there's nothing to configure in the all view.
  if (!project) return <Navigate to="/projects/all" replace />;

  return (
    <div className="min-h-0 flex-1 lg:overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-lg font-semibold tracking-tight text-emphasis">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Install, key, domains and integrations for {project.name}.
        </p>

        <div className="mt-8">
          <Section
            label="Install"
            hint="Paste before </body> on every page you want feedback from."
          >
            <InstallSnippet projectKey={project.key} />
          </Section>

          <Section label="Project key" hint="Identifies this project in the snippet.">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-default bg-elevated px-4 py-3">
              <code className="truncate font-mono text-xs text-default sm:text-sm">
                {project.key}
              </code>
              <CopyButton text={project.key} />
            </div>
          </Section>

          <Section label="Domains" hint="Only these sites can send feedback.">
            <div className="rounded-xl border border-default bg-elevated px-4 py-3.5">
              <DomainsEditor
                projectId={project.id}
                origins={project.allowedOrigins}
                onChange={(allowedOrigins) => setProject({ ...project, allowedOrigins })}
              />
            </div>
          </Section>

          <Section label="GitHub" hint="Open an issue in a repository for each new report.">
            <GithubDestination projectId={project.id} />
          </Section>

          <Section label="Danger zone" hint="This can't be undone.">
            <DangerZone project={project} projects={projects} onDeleted={removeProject} />
          </Section>
        </div>
      </div>
    </div>
  );
}
