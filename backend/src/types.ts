import type { Deps } from "./deps.ts";
import type { Store } from "./store/types.ts";

// `authUser` is added to Hono's context by @hono/auth-js's own module
// augmentation, so it isn't declared here.
export interface AppEnv {
  Variables: {
    /** The app's store, `deps.store`: the core plus whichever modules it has.
     *  A route mounted for a module gets it with `requireModule`. */
    store: Store;
    /** What the app was built from (createApp). */
    deps: Deps;
  };
}
