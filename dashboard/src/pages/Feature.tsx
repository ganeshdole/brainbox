import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { Feature, FeatureDetail, FeatureStatus, Issue } from "@ganeshdole/brainbox-shared";

import { Eyebrow } from "../components/Eyebrow";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { api, isAuthRedirect } from "../lib/api";
import { byDemand, FEATURE_STATUSES } from "../lib/feature";
import { importanceLabel } from "../lib/issue";
import { cleanIdentity, highlightLine } from "../lib/reporter";
import { useProject } from "../lib/useProject";
import { timeAgo } from "../lib/utils";

const selectClass =
  "h-9 min-w-0 rounded-lg border border-interactive bg-interactive px-3 text-sm text-emphasis outline-none transition focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50";

/** One end-user's request, as evidence: who asked, how much it matters, and
 *  what they said. Private to the dashboard. */
function RequestRow({
  request,
  projectId,
  busy,
  onRemove,
}: {
  request: Issue;
  projectId: string;
  busy: boolean;
  onRemove: () => void;
}) {
  const { name, email, phone } = cleanIdentity(request.metadata.identity);
  const who = name || email || phone || "Anonymous";
  const where = highlightLine(request.metadata.fields ?? []);
  const said = request.text?.trim() || request.audio?.transcript?.trim() || request.video?.transcript?.trim();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-emphasis">{who}</span>
        {where && <span className="text-muted">{where}</span>}
        {request.importance && (
          <span className="rounded-md border border-interactive bg-interactive px-1.5 py-0.5 font-mono text-[11px] text-default">
            {importanceLabel(request.importance)}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted">{timeAgo(request.createdAt)}</span>
      </div>
      {said ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-default">{said}</p>
      ) : (
        <p className="mt-1.5 text-sm text-muted">{request.audio ? "Voice note" : "No words"}</p>
      )}
      <div className="mt-2 flex gap-3 text-xs">
        <Link to={`/projects/${projectId}/issues/${request.id}`} className="text-link hover:underline">
          Open request
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="text-muted transition hover:text-emphasis disabled:opacity-50"
        >
          Not this feature
        </button>
      </div>
    </div>
  );
}

export function FeaturePage() {
  const { project } = useProject();
  const { featureId } = useParams<{ featureId: string }>();
  if (!featureId) return null;
  if (!project) return <Navigate to="/projects/all" replace />;
  return <FeatureView key={featureId} featureId={featureId} projectId={project.id} />;
}

function FeatureView({ featureId, projectId }: { featureId: string; projectId: string }) {
  const navigate = useNavigate();
  const [feature, setFeature] = useState<FeatureDetail | null>(null);
  const [others, setOthers] = useState<Feature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchAll = useCallback(
    () => Promise.all([api.getFeature(featureId), api.listFeatures(projectId)]),
    [featureId, projectId],
  );
  const show = useCallback(
    ([detail, all]: [FeatureDetail, Feature[]]) => {
      setFeature(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? "");
      setOthers(byDemand(all.filter((f) => f.id !== featureId)));
    },
    [featureId],
  );
  const load = useCallback(() => fetchAll().then(show), [fetchAll, show]);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((data) => {
        if (!cancelled) show(data);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, show]);

  async function act(change: () => Promise<unknown>, after: () => Promise<void> | void = load) {
    setBusy(true);
    setError(null);
    try {
      await change();
      await after();
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link
      to={`/projects/${projectId}/features`}
      className="mb-3 flex w-fit items-center gap-1 text-xs text-muted transition hover:text-emphasis"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Features
    </Link>
  );

  if (!feature) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        {back}
        {error ? (
          <p className="text-sm text-error">{error}</p>
        ) : (
          <>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-4 h-24 w-full rounded-xl" />
          </>
        )}
      </div>
    );
  }

  const saveTitle = () => {
    const next = title.trim();
    if (!next) return setTitle(feature.title);
    if (next !== feature.title) void act(() => api.updateFeature(feature.id, { title: next }));
  };
  const descriptionDirty = description.trim() !== (feature.description ?? "");

  return (
    <div className="min-h-0 flex-1 lg:overflow-y-auto">
      <article className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        {back}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center rounded-xl border border-interactive bg-interactive py-2">
            <span className="text-xl font-semibold leading-tight text-emphasis">{feature.requestCount}</span>
            <span className="font-mono text-[10px] text-muted">
              {feature.requestCount === 1 ? "request" : "requests"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              maxLength={200}
              aria-label="Title"
              className="w-full rounded-md bg-transparent text-lg font-semibold tracking-tight text-emphasis outline-none focus:ring-[3px] focus:ring-focus"
            />
            <p className="mt-1 font-mono text-xs text-muted">
              Started {timeAgo(feature.createdAt)} · updated {timeAgo(feature.updatedAt)}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Status
            <select
              value={feature.status}
              disabled={busy}
              onChange={(e) =>
                void act(() => api.updateFeature(feature.id, { status: e.target.value as FeatureStatus }))
              }
              className={selectClass}
            >
              {FEATURE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        <section className="mt-6">
          <Eyebrow className="block px-1 pb-2">Description</Eyebrow>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            placeholder="What it does and why, in your words. One day your users will read this."
            className="h-28 w-full resize-y rounded-xl border border-default bg-elevated p-3 text-sm text-default outline-none transition placeholder:text-placeholder focus:border-interactive"
          />
          {descriptionDirty && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(() =>
                    api.updateFeature(feature.id, { description: description.trim() || null }),
                  )
                }
              >
                Save description
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDescription(feature.description ?? "")}>
                Cancel
              </Button>
            </div>
          )}
        </section>

        <section className="mt-8">
          <Eyebrow className="block px-1 pb-2">Requests · {feature.requests.length}</Eyebrow>
          {feature.requests.length === 0 ? (
            <p className="rounded-xl border border-default bg-elevated px-4 py-6 text-center text-sm text-muted">
              No requests yet. Add them from the Features page as they come in.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-default bg-elevated">
              {feature.requests.map((request) => (
                <li key={request.id} className="border-t border-default first:border-t-0">
                  <RequestRow
                    request={request}
                    projectId={projectId}
                    busy={busy}
                    onRemove={() => void act(() => api.setIssueFeature(request.id, null))}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 space-y-3 rounded-xl border border-default bg-elevated px-4 py-3.5">
          {others.length > 0 && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!mergeInto) return;
                void act(
                  () => api.mergeFeature(feature.id, mergeInto),
                  () => navigate(`/projects/${projectId}/features/${mergeInto}`),
                );
              }}
            >
              <span className="text-sm text-default">Same as another feature?</span>
              <select
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
                disabled={busy}
                aria-label="Merge into"
                className={`${selectClass} min-w-48 flex-1`}
              >
                <option value="">Merge into…</option>
                {others.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} ({f.requestCount})
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={busy || !mergeInto}>
                Merge
              </Button>
            </form>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-default">
              {confirmDelete
                ? "Delete it? Its requests go back to waiting."
                : "Delete this feature. Its requests are kept."}
            </span>
            <div className="flex gap-2">
              {confirmDelete && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-error hover:text-error"
                disabled={busy}
                onClick={() =>
                  confirmDelete
                    ? void act(
                        () => api.deleteFeature(feature.id),
                        () => navigate(`/projects/${projectId}/features`),
                      )
                    : setConfirmDelete(true)
                }
              >
                {confirmDelete ? "Delete feature" : "Delete"}
              </Button>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
