import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { authHandler, initAuthConfig, verifyAuth } from "@hono/auth-js";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { getAuthConfig } from "./auth/config.ts";
import { env } from "./env.ts";
import { storeMiddleware } from "./middleware/store.ts";
import { requireSubscription } from "./middleware/requireSubscription.ts";
import { authError, AUTH_ERROR_PATH } from "./routes/auth-error.ts";
import { billing } from "./routes/billing.ts";
import { dashboardRoute } from "./routes/dashboard.ts";
import { featuresRoute } from "./routes/features.ts";
import { filesRoute } from "./routes/files.ts";
import { health } from "./routes/health.ts";
import { ingest } from "./routes/ingest.ts";
import { integrationsRoute } from "./routes/integrations.ts";
import { invitesRoute } from "./routes/invites.ts";
import { issuesRoute } from "./routes/issues.ts";
import { me } from "./routes/me.ts";
import { projectsRoute } from "./routes/projects.ts";
import { publicFiles } from "./routes/public-files.ts";
import { signInOptions } from "./routes/sign-in-options.ts";
import { teamsRoute } from "./routes/teams.ts";
import { waitlist } from "./routes/waitlist.ts";
import { webhooks } from "./routes/webhooks.ts";
import type { AppEnv } from "./types.ts";

export const app = new Hono<AppEnv>();

// Dashboard SPA CORS scoped to /api/* only (credentials:true for the JWT cookie).
// /ingest is cross-origin from arbitrary customer sites and sets its own CORS.
app.use("/api/*", cors({ origin: env.DASHBOARD_ORIGIN, credentials: true }));

app.use("*", initAuthConfig(getAuthConfig));
app.use("*", storeMiddleware);

// Public routes (before the auth gate).
app.route("/health", health);
// Auth.js endpoints: /api/auth/signin, /callback/google, /session, ...
app.use("/api/auth/*", authHandler());
// How email sign-in works here (link, code or both), for the login page.
app.route("/api/sign-in-options", signInOptions);
// Public widget ingest - auth is project key + origin allowlist, not a session.
app.route("/ingest", ingest);
// Public: where a failed sign-in lands before it is sent on to the dashboard.
app.route(AUTH_ERROR_PATH, authError);
// Public signed file links, embedded in external tickets (GitHub issue bodies).
app.route("/f", publicFiles);
// Public marketing waitlist capture - CORS-scoped to the marketing origins.
app.route("/waitlist", waitlist);
// Public payment webhooks - authenticated by Standard Webhooks signature, not
// by a session, so it must sit before the auth gate.
app.route("/webhooks", webhooks);

// Everything else under /api requires a valid session.
app.use("/api/*", verifyAuth());

// Session-only, no subscription needed: the dashboard shell has to render for
// an unpaid Account, and checkout is how it stops being unpaid. Gating these
// would leave the paywall with no exit. Invites likewise: joining a paying
// Team is the other way in.
app.route("/api/me", me);
app.route("/api/billing", billing);
app.route("/api/invites", invitesRoute);

// The paywall. Registered AFTER the two open routes above, so their handlers
// have already answered by the time this is reached - which is why this can be
// a blanket /api/* rather than a list of prefixes. A prefix list is easy to get
// wrong: "/api/projects/*" does not match "/api/projects" itself, so the list
// endpoint would have slipped through ungated.
app.use("/api/*", requireSubscription);
app.route("/api/projects", projectsRoute);
app.route("/api/issues", issuesRoute);
// /api/projects/:projectId/features and /api/features/:id
app.route("/api", featuresRoute);
app.route("/api/files", filesRoute);
app.route("/api/integrations", integrationsRoute);
app.route("/api/teams", teamsRoute);

// The dashboard, on deployments that serve it from the API (DASHBOARD_DIR).
// Last, so every API route above answers first.
if (env.DASHBOARD_DIR) {
  // Relative to the backend package (one level above src/ or dist/), not the
  // working directory, which differs between hosts.
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  app.route("/", dashboardRoute(resolve(packageRoot, env.DASHBOARD_DIR)));
}
