import type { FullStore } from "./store/index.ts";

// `authUser` is added to Hono's context by @hono/auth-js's own module
// augmentation, so it isn't declared here.
export interface AppEnv {
  Variables: {
    store: FullStore;
  };
}
