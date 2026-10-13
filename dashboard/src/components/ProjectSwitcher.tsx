import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { Project } from "@ganeshdole/brainbox-shared";

import { api } from "../lib/api";
import { groupByTeam, newProjectTeam } from "../lib/team";
import { cn } from "../lib/utils";

export function ProjectSwitcher({
  current,
  projects,
  onCreated,
}: {
  /** null = the all-projects view. */
  current: Project | null;
  projects: Project[];
  onCreated: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const groups = groupByTeam(projects);

  function close() {
    setOpen(false);
    setCreating(false);
    setName("");
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const teamId = newProjectTeam(current, projects);
      const project = await api.createProject({ name: name.trim(), ...(teamId ? { teamId } : {}) });
      onCreated(project);
      close();
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-interactive bg-interactive px-2.5 py-2 text-left text-sm text-emphasis outline-none transition hover:bg-interactive-hover focus-visible:ring-[3px] focus-visible:ring-focus"
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {current?.name ?? "All projects"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 min-w-48 overflow-hidden rounded-xl border border-default bg-elevated shadow-3xl">
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {projects.length > 1 && (
              <li className="border-b border-default pb-1 mb-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={current === null}
                  onClick={() => {
                    close();
                    if (current !== null) navigate("/projects/all");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-interactive-hover",
                    current === null ? "text-emphasis" : "text-default",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">All projects</span>
                  {current === null && <Check className="h-3.5 w-3.5 shrink-0 text-muted" />}
                </button>
              </li>
            )}
            {groups.map(({ team, projects: inTeam }) => (
              <li key={team.id} role="presentation">
                {/* Headings only once there is more than one Team to tell apart. */}
                {groups.length > 1 && (
                  <p className="truncate px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {team.name}
                  </p>
                )}
                <ul role="group" aria-label={team.name}>
                  {inTeam.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={p.id === current?.id}
                        onClick={() => {
                          close();
                          if (p.id !== current?.id) navigate(`/projects/${p.id}`);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-interactive-hover",
                          p.id === current?.id ? "text-emphasis" : "text-default",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.id === current?.id && <Check className="h-3.5 w-3.5 shrink-0 text-muted" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div className="border-t border-default">
            {creating ? (
              <form onSubmit={create} className="space-y-2 p-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  autoFocus
                  disabled={busy}
                  className="h-8 w-full min-w-0 rounded-md border border-interactive bg-interactive px-2.5 text-sm text-emphasis placeholder:text-placeholder outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="h-8 w-full rounded-md bg-brand text-sm font-medium text-on-brand transition hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create project"}
                </button>
                {error && <p className="px-0.5 text-xs text-error">{error}</p>}
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition hover:bg-interactive-hover hover:text-emphasis"
              >
                <Plus className="h-3.5 w-3.5" /> New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
