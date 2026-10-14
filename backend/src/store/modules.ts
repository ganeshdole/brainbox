import type { Store, StoreModule, StoreModules, StoreWith } from "./types.ts";

/** Every optional module a store can have, in the order the docs list them. */
export const STORE_MODULES = [
  "auth",
  "teams",
  "triage",
  "features",
  "integrations",
  "billing",
  "waitlist",
] as const satisfies readonly StoreModule[];

/** Whether the store has every one of `modules`. */
export function hasModules<M extends StoreModule>(store: Store, ...modules: M[]): store is StoreWith<M> {
  return modules.every((name) => store[name] !== undefined);
}

/** The modules this store has. */
export function modulesOf(store: Store): StoreModule[] {
  return STORE_MODULES.filter((name) => store[name] !== undefined);
}

/**
 * The store's `name` module, for code that only runs when it is there: a
 * route mounted for the module, or a caller that checked `hasModules`.
 * Throws otherwise, which is a wiring mistake, not a request's fault.
 */
export function requireModule<M extends StoreModule>(store: Store, name: M): StoreModules[M] {
  const module: StoreModules[M] | undefined = store[name] as StoreModules[M] | undefined;
  if (module === undefined) throw new Error(`This store has no ${name} module`);
  return module;
}
