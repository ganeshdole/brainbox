import type { BackendModule } from "@ganeshdole/brainbox-shared";
import { createContext, useContext } from "react";

/** Every optional part a backend can have: what one from before `/api/me`
 *  listed its modules has. */
export const ALL_MODULES: readonly BackendModule[] = ["teams", "triage", "features", "integrations", "billing"];

const KNOWN = new Set<string>(ALL_MODULES);

/** What `/api/me` says this backend has. A backend that doesn't say has them
 *  all; names this dashboard doesn't know are ignored. */
export function modulesFrom(me: unknown): ReadonlySet<BackendModule> {
  if (typeof me !== "object" || me === null || !("modules" in me) || !Array.isArray(me.modules)) {
    return new Set(ALL_MODULES);
  }
  return new Set(me.modules.filter((m): m is BackendModule => typeof m === "string" && KNOWN.has(m)));
}

export const ModulesContext = createContext<ReadonlySet<BackendModule>>(new Set(ALL_MODULES));

/** The optional parts of the backend this dashboard talks to: show a feature
 *  only when `has(module)`. */
export function useModules(): { has: (module: BackendModule) => boolean } {
  const modules = useContext(ModulesContext);
  return { has: (module) => modules.has(module) };
}
