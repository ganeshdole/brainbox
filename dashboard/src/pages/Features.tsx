import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Lightbulb, Plus } from "lucide-react";
import type { Feature, Issue } from "@ganeshdole/brainbox-shared";

import { EmptyState } from "../components/EmptyState";
import { FeatureStatusBadge } from "../components/FeatureStatusBadge";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api, isAuthRedirect } from "../lib/api";
import {
  byDemand,
  FEATURE_FILTERS,
  type FeatureFilterKey,
  titleFromRequest,
  waitingRequests,
} from "../lib/feature";
import { importanceLabel } from "../lib/issue";
import { cleanIdentity } from "../lib/reporter";
import { useProject } from "../lib/useProject";
import { cn, timeAgo } from "../lib/utils";

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-8 px-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted first:mt-0">
      {children}
    </div>
  );
}

/** How many asked, as the number a voting board would show. */
function Demand({ count }: { count: number }) {
  return (
    <span className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-interactive bg-interactive py-1">
      <span className="text-base font-semibold leading-tight text-emphasis">{count}</span>
      <span className="font-mono text-[10px] text-muted">{count === 1 ? "request" : "requests"}</span>
    </span>
  );
}

function FeatureRow({ feature, projectId }: { feature: Feature; projectId: string }) {
  return (
    <Link
      to={`/projects/${projectId}/features/${feature.id}`}
      className="flex items-center gap-4 px-4 py-3 transition hover:bg-interactive-hover"
    >
      <Demand count={feature.requestCount} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-emphasis">{feature.title}</span>
        {feature.description && (
          <span className="block truncate text-xs text-muted">{feature.description}</span>
        )}
      </span>
      <FeatureStatusBadge status={feature.status} />
      <span className="hidden w-14 shrink-0 text-right font-mono text-[11px] text-muted sm:block">
        {timeAgo(feature.updatedAt)}
      </span>
    </Link>
  );
}

/** A feature request no feature has taken in yet, and the two ways to sort it. */
function WaitingRow({
  request,
  projectId,
  features,
  busy,
  onStart,
  onAdd,
}: {
  request: Issue;
  projectId: string;
  features: Feature[];
  busy: boolean;
  onStart: (request: Issue) => void;
  onAdd: (request: Issue, feature: Feature) => void;
}) {
  const { name, email, phone } = cleanIdentity(request.metadata.identity);
  const meta = [
    name || email || phone,
    request.importance && importanceLabel(request.importance),
    timeAgo(request.createdAt),
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link to={`/projects/${projectId}/issues/${request.id}`} className="min-w-0 flex-1 basis-64">
        <span className="block truncate text-sm text-emphasis hover:underline">
          {titleFromRequest(request)}
        </span>
        <span className="block truncate text-xs text-muted">{meta.join(" · ")}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {features.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                Add to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {features.map((feature) => (
                <DropdownMenuItem key={feature.id} onSelect={() => onAdd(request, feature)}>
                  <span className="truncate">{feature.title}</span>
                  <span className="ml-auto pl-3 font-mono text-[11px] text-muted">
                    {feature.requestCount}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onStart(request)}>
          New feature
        </Button>
      </div>
    </div>
  );
}

export function Features() {
  const { project } = useProject();
  // Features belong to one project; there is no all-projects board.
  if (!project) return <Navigate to="/projects/all" replace />;
  return <FeaturesBoard key={project.id} projectId={project.id} />;
}

function FeaturesBoard({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<{ features: Feature[]; waiting: Issue[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeatureFilterKey>("open");
  const [newTitle, setNewTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api.listFeatures(projectId), api.listIssues(projectId)]).then(([features, issues]) => ({
        features: byDemand(features),
        waiting: waitingRequests(issues),
      })),
    [projectId],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /** Run a change, then refresh; errors show above the list. */
  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await change();
      setData(await load());
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start(title: string, requestIds: string[] = []) {
    setBusy(true);
    setError(null);
    try {
      const feature = await api.createFeature(projectId, { title, requestIds });
      navigate(`/projects/${projectId}/features/${feature.id}`);
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
      setBusy(false);
    }
  }

  const active = FEATURE_FILTERS.find((f) => f.key === filter) ?? FEATURE_FILTERS[0];
  const shown = data?.features.filter(active.match) ?? [];

  return (
    <div className="min-h-0 flex-1 lg:overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-emphasis">Features</h1>
            <span className="font-mono text-xs text-muted">{data ? data.features.length : "…"}</span>
          </div>
          <Button
            className="ml-auto"
            size="sm"
            variant="secondary"
            onClick={() => setNewTitle((t) => (t === null ? "" : null))}
          >
            <Plus /> New feature
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">
          What your users want built. Sort each new request into a feature; the most asked
          for rise to the top.
        </p>

        {newTitle !== null && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTitle.trim()) void start(newTitle.trim());
            }}
          >
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What should it do? e.g. Export invoices to CSV"
              maxLength={200}
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !newTitle.trim()}>
              Create
            </Button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        {!data && !error && (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {data && data.waiting.length > 0 && (
          <section className="mt-6">
            <GroupLabel>Waiting to be sorted · {data.waiting.length}</GroupLabel>
            <ul className="overflow-hidden rounded-xl border border-default bg-elevated">
              {data.waiting.map((request) => (
                <li key={request.id} className="border-t border-default first:border-t-0">
                  <WaitingRow
                    request={request}
                    projectId={projectId}
                    features={data.features}
                    busy={busy}
                    onStart={(r) => void start(titleFromRequest(r), [r.id])}
                    onAdd={(r, feature) => void act(() => api.setIssueFeature(r.id, feature.id))}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && data.features.length === 0 && data.waiting.length === 0 && (
          <div className="py-16">
            <EmptyState icon={<Lightbulb />} title="No feature requests yet">
              <p className="mt-1 max-w-sm text-sm text-muted">
                Requests from the widget land here. Add a "Request a feature" button to your app
                from{" "}
                <Link to={`/projects/${projectId}/settings`} className="text-link hover:underline">
                  Settings
                </Link>
                , or start a feature yourself.
              </p>
            </EmptyState>
          </div>
        )}

        {data && data.features.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {FEATURE_FILTERS.map((f) => {
                const count = data.features.filter(f.match).length;
                if (f.key !== "open" && f.key !== "all" && count === 0) return null;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs transition",
                      filter === f.key
                        ? "bg-interactive text-emphasis"
                        : "text-muted hover:bg-interactive-hover hover:text-emphasis",
                    )}
                  >
                    {f.label} <span className="font-mono">{count}</span>
                  </button>
                );
              })}
            </div>
            {shown.length > 0 ? (
              <ul className="overflow-hidden rounded-xl border border-default bg-elevated">
                {shown.map((feature) => (
                  <li key={feature.id} className="border-t border-default first:border-t-0">
                    <FeatureRow feature={feature} projectId={projectId} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pb-4 pt-10 text-center text-sm text-muted">
                No {active.label.toLowerCase()} features.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
