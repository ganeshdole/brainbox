import type { BackendModule } from "@ganeshdole/brainbox-shared";
import { useSession } from "@hono/auth-js/react";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { api } from "../lib/api";
import { ALL_MODULES, ModulesContext, modulesFrom } from "../lib/modules";
import { Spinner } from "./ui/spinner";

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background">
      <Spinner />
    </div>
  );
}

export function ProtectedRoute() {
  const { status } = useSession();
  const location = useLocation();

  if (status === "loading") return <Loading />;
  if (status === "unauthenticated") {
    // Carry where they were headed. Login turns this into the OAuth
    // callbackUrl, so a deep link survives the sign-in round trip instead of
    // everyone landing on the dashboard root with their intent discarded.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <WithModules />;
}

/** Asks the backend once which optional parts it has, before any page shows
 *  (or hides) them. If it can't say, everything is shown, as before. */
function WithModules() {
  const [modules, setModules] = useState<ReadonlySet<BackendModule> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((me) => modulesFrom(me))
      .catch(() => new Set(ALL_MODULES))
      .then((found) => {
        if (!cancelled) setModules(found);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!modules) return <Loading />;
  return (
    <ModulesContext.Provider value={modules}>
      <Outlet />
    </ModulesContext.Provider>
  );
}
