import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Feature, Issue } from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import { byDemand, titleFromRequest } from "../lib/feature";
import { Button } from "./ui/button";

const selectClass =
  "h-8 min-w-0 max-w-72 rounded-md border border-interactive bg-interactive px-2 text-xs text-emphasis outline-none transition focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50";

/** Which feature a feature request counts toward, and the way to change it. */
export function IssueFeature({
  issue,
  projectId,
  onChange,
}: {
  issue: Issue;
  projectId: string;
  onChange: (issue: Issue) => void;
}) {
  const navigate = useNavigate();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listFeatures(projectId)
      .then((list) => {
        if (!cancelled) setFeatures(byDemand(list));
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function run(change: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await change();
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = features?.find((f) => f.id === issue.featureId);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Feature</span>
      <select
        value={issue.featureId ?? ""}
        disabled={busy || !features}
        aria-label="Feature"
        onChange={(e) =>
          void run(async () => onChange(await api.setIssueFeature(issue.id, e.target.value || null)))
        }
        className={selectClass}
      >
        <option value="">Waiting to be sorted</option>
        {features?.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title} ({f.requestCount})
          </option>
        ))}
      </select>
      {current ? (
        <Link to={`/projects/${projectId}/features/${current.id}`} className="text-link hover:underline">
          Open feature
        </Link>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const feature = await api.createFeature(projectId, {
                title: titleFromRequest(issue),
                requestIds: [issue.id],
              });
              navigate(`/projects/${projectId}/features/${feature.id}`);
            })
          }
        >
          New feature from this
        </Button>
      )}
      {error && <span className="text-error">{error}</span>}
    </div>
  );
}
