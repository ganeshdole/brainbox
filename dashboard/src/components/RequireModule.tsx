import type { BackendModule } from "@ganeshdole/brainbox-shared";
import { Navigate, Outlet, useOutletContext, useParams } from "react-router-dom";

import { useModules } from "../lib/modules";

/** Pages for an optional part of the backend. Without it, an old link lands
 *  on the project's reports (or home) instead of a page of errors. */
export function RequireModule({ module }: { module: BackendModule }) {
  const { has } = useModules();
  const { projectId } = useParams();
  // Pass the layout's context on (ProjectLayout's project), which a bare
  // Outlet would drop for the pages below.
  const context = useOutletContext();
  if (has(module)) return <Outlet context={context} />;
  return <Navigate to={projectId ? `/projects/${projectId}` : "/"} replace />;
}
