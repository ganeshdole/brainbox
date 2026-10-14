import { serve } from "@hono/node-server";

import { createApp } from "../src/create-app.ts";
import { env } from "../src/env.ts";
import { fromEnv } from "../src/from-env.ts";
import { getStore } from "../src/store/index.ts";

// A backend built from parts, for e2e/tests/parts.spec.ts: the env's settings
// and Postgres, but a store of only the core, sign-in and Teams, and no
// billing. The dashboard in front of it should offer nothing else.

const full = getStore();
const app = createApp({
  ...fromEnv(),
  store: { projects: full.projects, issues: full.issues, auth: full.auth, teams: full.teams },
  billing: undefined,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`brainbox backend from parts listening on http://localhost:${info.port}`);
});
