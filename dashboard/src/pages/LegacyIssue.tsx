import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { Spinner } from "../components/ui/spinner";
import { api, isAuthRedirect } from "../lib/api";

/** Old `/issues/:id` links resolve the issue's project, then land in the inbox. */
export function LegacyIssue() {
  const { id } = useParams<{ id: string }>();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getIssue(id)
      .then((issue) => {
        if (!cancelled) setTarget(`/projects/${issue.projectId}/issues/${issue.id}`);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (target) return <Navigate to={target} replace />;

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      {error ? (
        <div className="text-center">
          <p className="text-sm text-error">{error}</p>
          <Link to="/" className="mt-2 inline-block text-sm text-link hover:underline">
            Back to projects
          </Link>
        </div>
      ) : (
        <Spinner />
      )}
    </div>
  );
}
