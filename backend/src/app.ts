import { createApp } from "./create-app.ts";
import { fromEnv } from "./from-env.ts";

/** The backend as the environment configures it (`src/env.ts`): what the
 *  Node server and Azure Functions entries serve. */
export const app = createApp(fromEnv());
