import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type {
  AzureDevopsDestinationConfig,
  AzureDevopsIterationConfig,
  AzureDevopsTeamSettings,
  AzureDevopsWorkItemConfig,
  AzureDevopsWorkItemType,
  AzureDevopsWorkItemTypeInfo,
  DestinationInputs,
  IntegrationConnection,
  ProjectDestination,
} from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import { bugVisibilityWarning, defaultBugType, defaultFeatureType, iterationInput, parseLabels } from "../lib/integrations";
import { AzureDevopsMark } from "./ProviderMark";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

const selectClass =
  "mt-1 h-10 w-full min-w-0 rounded-lg border border-interactive bg-interactive px-3 text-sm text-emphasis outline-none transition focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50";

type AzureDevopsDestinationRecord = Extract<ProjectDestination, { provider: "azure-devops" }>;

/**
 * The value `load` resolves to, fetched again whenever `load` changes (so wrap
 * it in useCallback or useMemo); null while loading or when `load` is null.
 */
function useLoaded<T>(load: (() => Promise<T>) | null): { data: T | null; error: string | null } {
  const [result, setResult] = useState<{ load: () => Promise<T>; data: T | null; error: string | null } | null>(
    null,
  );
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResult({ load, data, error: null });
      },
      (e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setResult({ load, data: null, error: e.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  return result && result.load === load ? result : { data: null, error: null };
}

/** Settings → Destinations → Azure DevOps: connect with a token, then pick
 *  where bugs and feature requests land. Saved means every new report is sent. */
export function AzureDevopsDestination({ projectId, teamId }: { projectId: string; teamId: string }) {
  const [reload, setReload] = useState(0);
  return (
    <AzureDevopsCard key={reload} projectId={projectId} teamId={teamId} onChanged={() => setReload((n) => n + 1)} />
  );
}

function AzureDevopsCard({
  projectId,
  teamId,
  onChanged,
}: {
  projectId: string;
  teamId: string;
  onChanged: () => void;
}) {
  const { data, error } = useLoaded(
    useCallback(() => Promise.all([api.getIntegrations(teamId), api.listDestinations(projectId)]), [teamId, projectId]),
  );
  const [changingToken, setChangingToken] = useState(false);
  const [busy, setBusy] = useState(false);

  const destination =
    data?.[1].find((d): d is AzureDevopsDestinationRecord => d.provider === "azure-devops") ?? null;
  const connections = data?.[0].connections.filter((c) => c.provider === "azure-devops") ?? [];
  const connection = connections.find((c) => c.id === destination?.connectionId) ?? connections[0];

  async function disconnect(id: string) {
    setBusy(true);
    try {
      await api.deleteConnection(id);
      onChanged();
    } catch (e) {
      if (!isAuthRedirect(e)) setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-default bg-elevated px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AzureDevopsMark className="size-4 shrink-0" />
          <span className="text-sm text-emphasis">Azure DevOps</span>
          {connection?.status === "needs_reauth" ? (
            <span className="rounded-full border border-default px-2 text-[11px] text-error">Needs a new token</span>
          ) : destination ? (
            <span className="rounded-full border border-default px-2 text-[11px] text-default">Sending</span>
          ) : null}
        </div>
        {connection && (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-muted">{connection.label} · token</span>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setChangingToken((v) => !v)}>
              {changingToken ? "Cancel" : "Change token"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-error hover:text-error"
              onClick={() => void disconnect(connection.id)}
            >
              Disconnect
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3">
        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : !data ? (
          <Skeleton className="h-10 w-full" />
        ) : !data[0].azureDevops.available ? (
          <p className="text-sm text-muted">Azure DevOps isn't set up on this deployment.</p>
        ) : !connection || changingToken ? (
          <TokenForm teamId={teamId} organization={connection?.label} onConnected={onChanged} />
        ) : connection.status === "needs_reauth" ? (
          <>
            <p className="rounded-lg border border-default bg-subtle px-3 py-2 text-xs text-error">
              Azure DevOps rejected the token for {connection.label}: it expired or was revoked. Reports aren't being
              sent. Paste a new one; the settings below stay as they are.
            </p>
            <TokenForm teamId={teamId} organization={connection.label} onConnected={onChanged} />
          </>
        ) : (
          <WorkItemSettings
            projectId={projectId}
            connection={connection}
            destination={destination}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}

function TokenForm({
  teamId,
  organization: knownOrganization,
  onConnected,
}: {
  teamId: string;
  /** Set when reconnecting: the token is for this organization. */
  organization?: string;
  onConnected: () => void;
}) {
  const [organization, setOrganization] = useState(
    knownOrganization ? `https://dev.azure.com/${knownOrganization}` : "",
  );
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.connectAzureDevops(teamId, organization, token);
      onConnected();
    } catch (err) {
      if (isAuthRedirect(err)) return;
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void connect(e)} className="space-y-3">
      <p className="text-xs text-muted">
        Paste your organization's URL and a personal access token with{" "}
        <span className="text-default">Work Items (Read &amp; write)</span> and{" "}
        <span className="text-default">Project and Team (Read)</span>. Work items are created as the token's owner, so
        a service account's token keeps working when people leave.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Organization
          <Input
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="https://dev.azure.com/acme"
            disabled={busy || !!knownOrganization}
            className="mt-1"
          />
        </label>
        <label className="block text-xs text-muted">
          Personal access token
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
            className="mt-1"
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Stored encrypted. Never shown again.</span>
        <Button type="submit" variant="outline" size="sm" disabled={busy || !organization.trim() || !token.trim()}>
          {busy ? "Checking…" : knownOrganization ? "Reconnect" : "Connect"}
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </form>
  );
}

/** What someone has picked for one kind of report. Unset fields follow the defaults. */
interface KindDraft {
  type?: string;
  iteration?: AzureDevopsIterationConfig["kind"];
  fixedPath: string;
  tags: string;
  priority: number;
  fields: Record<string, string>;
}

function draftOf(saved: AzureDevopsWorkItemConfig | undefined, tags: string[]): KindDraft {
  return {
    type: saved?.type,
    iteration: saved?.iteration.kind,
    fixedPath: saved?.iteration.kind === "fixed" ? saved.iteration.path : "",
    tags: (saved?.tags ?? tags).join(", "),
    priority: saved?.priority ?? 2,
    fields: Object.fromEntries((saved?.fields ?? []).map((f) => [f.referenceName, f.value])),
  };
}

function WorkItemSettings({
  projectId,
  connection,
  destination,
  onChanged,
}: {
  projectId: string;
  connection: IntegrationConnection;
  destination: AzureDevopsDestinationRecord | null;
  onChanged: () => void;
}) {
  const saved: AzureDevopsDestinationConfig | undefined = destination?.config;
  const conn = connection.id;
  const [project, setProject] = useState(saved?.project ?? null);
  const [team, setTeam] = useState(saved?.team ?? null);
  const [areaPath, setAreaPath] = useState(saved?.areaPath);
  const [assignedTo, setAssignedTo] = useState(saved?.assignedTo ?? "");
  const [bug, setBug] = useState(() => draftOf(saved?.bug, ["brainbox", "feedback"]));
  const [feature, setFeature] = useState(() => draftOf(saved?.feature, ["brainbox", "feature-request"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ externalId: string; url: string } | null>(null);

  // Each picker loads from the one before: project, then its teams and types.
  const adoProject = project?.id;
  const projectName = project?.name;
  const adoTeam = team?.id;
  const projects = useLoaded(useCallback(() => api.adoProjects(conn), [conn]));
  const teams = useLoaded(useMemo(() => (adoProject ? () => api.adoTeams(conn, adoProject) : null), [conn, adoProject]));
  const types = useLoaded(useMemo(() => (adoProject ? () => api.adoTypes(conn, adoProject) : null), [conn, adoProject]));
  const settings = useLoaded(
    useMemo(
      () =>
        adoProject && projectName && adoTeam
          ? () => api.adoTeam(conn, { id: adoProject, name: projectName }, adoTeam)
          : null,
      [conn, adoProject, projectName, adoTeam],
    ),
  );

  const board = settings.data;
  const area = areaPath ?? board?.defaultAreaPath ?? "";
  const bugType = bug.type ?? (types.data ? defaultBugType(types.data) : "");
  const featureType = feature.type ?? (types.data ? defaultFeatureType(types.data) : "");
  // Bugs follow the sprint where the team only shows them on its taskboard.
  const bugIteration = bug.iteration ?? (board?.bugsBehavior === "asTasks" ? "current" : "backlog");
  const featureIteration = feature.iteration ?? "backlog";

  const bugInfo = useLoaded(
    useMemo(() => (adoProject && bugType ? () => api.adoType(conn, adoProject, bugType) : null), [conn, adoProject, bugType]),
  );
  const featureInfo = useLoaded(
    useMemo(
      () => (adoProject && featureType ? () => api.adoType(conn, adoProject, featureType) : null),
      [conn, adoProject, featureType],
    ),
  );

  const loadError = projects.error ?? teams.error ?? types.error ?? settings.error ?? bugInfo.error ?? featureInfo.error;
  // "Fixed" isn't saved until it has an iteration: it never quietly becomes the backlog.
  const bugIterationInput = board ? iterationInput(bugIteration, bug.fixedPath, board.backlogIteration) : null;
  const featureIterationInput = board ? iterationInput(featureIteration, feature.fixedPath, board.backlogIteration) : null;
  const ready = !!(project && team && bugInfo.data && featureInfo.data && area && bugIterationInput && featureIterationInput);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      await action();
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!project || !team || !bugInfo.data || !featureInfo.data || !bugIterationInput || !featureIterationInput) return;
    const config: DestinationInputs["azure-devops"] = {
      project,
      team,
      areaPath: area,
      ...(assignedTo.trim() && { assignedTo: assignedTo.trim() }),
      bug: kindInput(bug, bugType, bugIterationInput, bugInfo.data),
      feature: kindInput(feature, featureType, featureIterationInput, featureInfo.data),
    };
    void run(async () => {
      // Every new report is sent once saved: there's no paused state here.
      await api.saveDestination(projectId, "azure-devops", { connectionId: conn, config, enabled: true });
      onChanged();
    });
  }

  if (projects.error) return <p className="text-xs text-error">{projects.error}</p>;
  if (!projects.data) return <Skeleton className="h-10 w-full" />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-1"
    >
      <Heading>Where items go</Heading>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-muted">
          Project
          <select
            aria-label="Project"
            value={project?.id ?? ""}
            disabled={busy}
            className={selectClass}
            onChange={(e) => {
              setProject(projects.data?.find((p) => p.id === e.target.value) ?? null);
              setTeam(null);
              setAreaPath(undefined);
              setBug((d) => ({ ...d, type: undefined, fixedPath: "" }));
              setFeature((d) => ({ ...d, type: undefined, fixedPath: "" }));
            }}
          >
            {!project && <option value="">Choose a project…</option>}
            {projects.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Team
          <select
            aria-label="Team"
            value={team?.id ?? ""}
            disabled={busy || !teams.data}
            className={selectClass}
            onChange={(e) => {
              setTeam(teams.data?.find((t) => t.id === e.target.value) ?? null);
              setAreaPath(undefined);
            }}
          >
            {!team && <option value="">{project ? "Choose a team…" : "Pick a project first"}</option>}
            {team && !teams.data && <option value={team.id}>{team.name}</option>}
            {teams.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          Area
          <select
            aria-label="Area"
            value={area}
            disabled={busy || !board}
            className={selectClass}
            onChange={(e) => setAreaPath(e.target.value)}
          >
            {!board && <option value={area}>{area || "Pick a team first"}</option>}
            {board &&
              [...new Set([area, ...board.areaPaths])].filter(Boolean).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="block pt-2 text-xs text-muted sm:w-1/2">
        Assigned to <span className="text-muted">(optional)</span>
        <Input
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="someone@company.com"
          disabled={busy}
          className="mt-1"
        />
      </label>

      <div className="grid gap-x-6 sm:grid-cols-2">
        <KindFields
          heading="Bugs"
          draft={bug}
          onChange={setBug}
          type={bugType}
          iteration={bugIteration}
          types={types.data}
          info={bugInfo.data}
          board={board}
          busy={busy}
        />
        <KindFields
          heading="Feature requests"
          draft={feature}
          onChange={setFeature}
          type={featureType}
          iteration={featureIteration}
          types={types.data}
          info={featureInfo.data}
          board={board}
          busy={busy}
          priorityHint="Their importance replaces it: blocking 1, important 2, nice to have 3."
        />
      </div>

      {board && (
        <Warning text={bugVisibilityWarning(bugType, board.bugsBehavior, bugIteration)} />
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
        {destination && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.deleteDestination(projectId, "azure-devops");
                  onChanged();
                })
              }
            >
              Stop sending
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => setSent(await api.testDestination(projectId, "azure-devops")))
              }
            >
              Send a test report
            </Button>
          </>
        )}
        <Button type="submit" variant="outline" size="sm" disabled={busy || !ready}>
          {busy ? "Working…" : destination ? "Save" : "Send reports to Azure DevOps"}
        </Button>
      </div>
      {(error ?? loadError) && <p className="text-xs text-error">{error ?? loadError}</p>}
      {sent && (
        <p className="text-xs text-default">
          Test report created:{" "}
          <a href={sent.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-link">
            work item {sent.externalId} <ExternalLink className="h-3 w-3" />
          </a>
          . It's safe to close.
        </p>
      )}
    </form>
  );
}

/** One kind's draft as the backend takes it. */
function kindInput(
  draft: KindDraft,
  type: string,
  iteration: AzureDevopsIterationConfig,
  info: AzureDevopsWorkItemTypeInfo,
): DestinationInputs["azure-devops"]["bug"] {
  return {
    type,
    iteration,
    tags: parseLabels(draft.tags),
    ...(info.hasPriority && { priority: draft.priority }),
    fields: info.required.flatMap((f) => {
      const value = draft.fields[f.referenceName]?.trim();
      return value ? [{ referenceName: f.referenceName, value }] : [];
    }),
  };
}

const ITERATIONS: Array<[AzureDevopsIterationConfig["kind"], string]> = [
  ["backlog", "Team backlog"],
  ["current", "Current sprint"],
  ["fixed", "Fixed"],
];

function KindFields({
  heading,
  draft,
  onChange,
  type,
  iteration,
  types,
  info,
  board,
  busy,
  priorityHint,
}: {
  heading: string;
  draft: KindDraft;
  onChange: (update: (d: KindDraft) => KindDraft) => void;
  type: string;
  iteration: AzureDevopsIterationConfig["kind"];
  types: AzureDevopsWorkItemType[] | null;
  info: AzureDevopsWorkItemTypeInfo | null;
  board: AzureDevopsTeamSettings | null;
  busy: boolean;
  priorityHint?: string;
}) {
  const set = (patch: Partial<KindDraft>) => onChange((d) => ({ ...d, ...patch }));
  const current = board?.iterations.find((i) => i.timeFrame === "current");
  return (
    <div className="space-y-2">
      <Heading>{heading}</Heading>
      <label className="block text-xs text-muted">
        Work item type
        <select
          aria-label={`${heading}: work item type`}
          value={type}
          disabled={busy || !types}
          className={selectClass}
          onChange={(e) => set({ type: e.target.value, fields: {} })}
        >
          {!types && <option value={type}>{type || "Pick a project first"}</option>}
          {types?.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="text-xs text-muted">
        Iteration
        <div className="mt-1 flex flex-wrap overflow-hidden rounded-lg border border-interactive">
          {ITERATIONS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={busy}
              aria-pressed={iteration === kind}
              onClick={() => set({ iteration: kind })}
              className={`flex-1 border-r border-interactive px-2 py-1.5 last:border-r-0 ${
                iteration === kind ? "bg-interactive text-emphasis" : "text-muted"
              }`}
            >
              {kind === "current" && current ? `${label} (${current.name})` : label}
            </button>
          ))}
        </div>
      </div>
      {iteration === "fixed" && (
        <select
          aria-label={`${heading} iteration`}
          value={draft.fixedPath}
          disabled={busy || !board}
          className={selectClass}
          onChange={(e) => set({ fixedPath: e.target.value })}
        >
          <option value="">Choose an iteration…</option>
          {board?.iterations.map((i) => (
            <option key={i.path} value={i.path}>
              {i.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted">
          Tags
          <Input value={draft.tags} onChange={(e) => set({ tags: e.target.value })} disabled={busy} className="mt-1" />
        </label>
        {info?.hasPriority && (
          <label className="block text-xs text-muted">
            Priority
            <select
              aria-label={`${heading}: priority`}
              value={draft.priority}
              disabled={busy}
              className={selectClass}
              onChange={(e) => set({ priority: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {info?.hasPriority && priorityHint && <p className="text-xs text-muted">{priorityHint}</p>}
      {info?.required.map((f) => (
        <label key={f.referenceName} className="block text-xs text-muted">
          {f.name} <span className="text-muted">(required by {type})</span>
          {f.allowedValues.length > 0 ? (
            <select
              value={draft.fields[f.referenceName] ?? ""}
              disabled={busy}
              className={selectClass}
              onChange={(e) => set({ fields: { ...draft.fields, [f.referenceName]: e.target.value } })}
            >
              <option value="">Choose…</option>
              {f.allowedValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={draft.fields[f.referenceName] ?? ""}
              onChange={(e) => set({ fields: { ...draft.fields, [f.referenceName]: e.target.value } })}
              disabled={busy}
              className="mt-1"
            />
          )}
        </label>
      ))}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 text-xs font-semibold text-default after:h-px after:flex-1 after:bg-[var(--border-default)]">
      {children}
    </div>
  );
}

function Warning({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-3 rounded-lg border border-default bg-subtle px-3 py-2 text-xs text-default">{text}</p>;
}
