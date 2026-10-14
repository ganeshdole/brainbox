import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  IntegrationConnection,
  IntegrationRepo,
  IntegrationsState,
  ProjectDestination,
} from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import { installResult, parseLabels } from "../lib/integrations";
import { GithubMark } from "./GithubMark";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

const selectClass =
  "h-10 w-full min-w-0 rounded-lg border border-interactive bg-interactive px-3 text-sm text-emphasis outline-none transition focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50";

interface Loaded {
  state: IntegrationsState;
  destination: ProjectDestination | null;
}

export function GithubDestination({ projectId, teamId }: { projectId: string; teamId: string }) {
  const [params, setParams] = useSearchParams();
  const [notice] = useState(() => installResult(params));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!params.has("github")) return;
    const next = new URLSearchParams(params);
    next.delete("github");
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getIntegrations(teamId), api.listDestinations(projectId)])
      .then(([state, list]) => {
        if (cancelled) return;
        setLoaded({ state, destination: list.find((d) => d.provider === "github") ?? null });
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, teamId, reload]);

  async function connect() {
    try {
      const { url } = await api.startGithubInstall(projectId);
      window.location.assign(url);
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    }
  }

  return (
    <div className="rounded-xl border border-default bg-elevated px-4 py-3.5">
      {notice === "connected" && (
        <p className="mb-3 text-xs text-default">GitHub connected. Pick a repository below.</p>
      )}
      {notice === "error" && (
        <p className="mb-3 text-xs text-error">GitHub didn't connect. Try again.</p>
      )}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : !loaded ? (
        <Skeleton className="h-10 w-full" />
      ) : !loaded.state.github.available ? (
        <p className="text-sm text-muted">GitHub isn't set up on this deployment.</p>
      ) : loaded.state.connections.length === 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-default">Open a GitHub issue for every report.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void connect()}>
            <GithubMark className="size-4" /> Connect GitHub
          </Button>
        </div>
      ) : (
        <DestinationForm
          key={loaded.destination?.id ?? "new"}
          projectId={projectId}
          connections={loaded.state.connections}
          destination={loaded.destination}
          onConnect={() => void connect()}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}

function DestinationForm({
  projectId,
  connections,
  destination,
  onConnect,
  onChanged,
}: {
  projectId: string;
  connections: IntegrationConnection[];
  destination: ProjectDestination | null;
  onConnect: () => void;
  onChanged: () => void;
}) {
  const [connectionId, setConnectionId] = useState(
    destination?.connectionId ?? connections[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const connection = connections.find((c) => c.id === connectionId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GithubMark className="size-4 shrink-0 text-muted" />
        {connections.length > 1 ? (
          <select
            aria-label="GitHub account"
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            disabled={busy}
            className={selectClass}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-sm text-emphasis">{connection?.label}</span>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onConnect}>
          Add account
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || !connection}
          className="text-error hover:text-error"
          onClick={() => void run(() => api.deleteConnection(connectionId))}
        >
          Disconnect
        </Button>
      </div>

      <RepoSettings
        key={connectionId}
        projectId={projectId}
        connectionId={connectionId}
        destination={destination?.connectionId === connectionId ? destination : null}
        busy={busy}
        run={run}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

function RepoSettings({
  projectId,
  connectionId,
  destination,
  busy,
  run,
}: {
  projectId: string;
  connectionId: string;
  destination: ProjectDestination | null;
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [repos, setRepos] = useState<IntegrationRepo[] | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repo, setRepo] = useState(
    destination ? `${destination.config.owner}/${destination.config.repo}` : "",
  );
  const [labels, setLabels] = useState(destination?.config.labels.join(", ") ?? "");
  // Saved before feature requests means none set, and the backend uses enhancement.
  const [featureLabels, setFeatureLabels] = useState(
    (destination?.config.featureLabels ?? ["enhancement"]).join(", "),
  );
  const [enabled, setEnabled] = useState(destination?.enabled ?? true);

  useEffect(() => {
    let cancelled = false;
    api
      .listRepos(connectionId)
      .then((list) => {
        if (cancelled) return;
        setRepos(list);
        if (list.length === 1) setRepo((current) => current || (list[0]?.fullName ?? ""));
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setRepoError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const picked = repos?.find((r) => r.fullName === repo);

  function save() {
    if (!picked) return;
    void run(() =>
      api.saveDestination(projectId, "github", {
        connectionId,
        config: {
          owner: picked.owner,
          repo: picked.name,
          labels: parseLabels(labels),
          featureLabels: parseLabels(featureLabels),
        },
        enabled,
      }),
    );
  }

  if (repoError) return <p className="text-xs text-error">{repoError}</p>;
  if (!repos) return <Skeleton className="h-10 w-full" />;
  if (repos.length === 0) {
    return (
      <p className="text-xs text-muted">
        This installation can't see any repositories. Grant it access on GitHub, then reload.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Repository
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            disabled={busy}
            className={`${selectClass} mt-1`}
          >
            {!picked && (
              <option value="" disabled>
                Choose a repository…
              </option>
            )}
            {repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}
                {r.private ? " (private)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Labels
          <Input
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            placeholder="feedback, bug"
            disabled={busy}
            className="mt-1"
          />
        </label>
        <label className="block text-xs text-muted sm:col-start-2">
          Feature request labels
          <Input
            value={featureLabels}
            onChange={(e) => setFeatureLabels(e.target.value)}
            placeholder="enhancement"
            disabled={busy}
            className="mt-1"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-default">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={busy}
            className="size-4 accent-[var(--bg-brand)]"
          />
          Send every new report
        </label>
        <div className="flex items-center gap-2">
          {destination && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => api.deleteDestination(projectId, "github"))}
            >
              Stop sending
            </Button>
          )}
          <Button type="submit" variant="outline" size="sm" disabled={busy || !picked}>
            {busy
              ? "Saving…"
              : destination
                ? "Save"
                : picked
                  ? `Send reports to ${picked.name}`
                  : "Choose a repository"}
          </Button>
        </div>
      </div>
    </form>
  );
}
