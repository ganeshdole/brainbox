import { authHandler, initAuthConfig, verifyAuth } from "@hono/auth-js";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { createAuthConfig } from "./auth/config.ts";
import { resolveDeps, type AppDeps } from "./deps.ts";
import { requireSubscription } from "./middleware/requireSubscription.ts";
import { authError, AUTH_ERROR_PATH } from "./routes/auth-error.ts";
import { billing } from "./routes/billing.ts";
import { dashboardRoute } from "./routes/dashboard.ts";
import { destinationsRoute } from "./routes/destinations.ts";
import { featuresRoute } from "./routes/features.ts";
import { filesRoute } from "./routes/files.ts";
import { health } from "./routes/health.ts";
import { ingest } from "./routes/ingest.ts";
import { integrationsRoute } from "./routes/integrations.ts";
import { invitesRoute } from "./routes/invites.ts";
import { issueDeliveriesRoute, issueFeatureRoute, issuesRoute, triageRoute } from "./routes/issues.ts";
import { me } from "./routes/me.ts";
import { projectsRoute } from "./routes/projects.ts";
import { publicFiles } from "./routes/public-files.ts";
import { signInOptions } from "./routes/sign-in-options.ts";
import { teamsRoute } from "./routes/teams.ts";
import { createWaitlistRoute } from "./routes/waitlist.ts";
import { dodoWebhook, githubWebhook } from "./routes/webhooks.ts";
import type { AppEnv } from "./types.ts";

export type { AppDeps, AppOptions, AuthOptions, BillingOptions } from "./deps.ts";

/**
 * A Brainbox backend from parts: a web-standard Hono app over the given
 * store, file storage and settings. Everything it uses comes from `deps`, so
 * two apps in one process share nothing.
 *
 * What is served follows from what is given. Ingest, file links and health
 * always; the dashboard API with `auth` (and a store with the auth module);
 * then each optional store module's routes when the store has it: teams and
 * invites, triage, features, integrations, waitlist. Billing needs both
 * `billing` and the store's billing module, and adds the paywall.
 */
export function createApp(input: AppDeps): Hono<AppEnv> {
  const deps = resolveDeps(input);
  const { store, options } = deps;
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    c.set("store", store);
    await next();
  });

  // Public routes (before the auth gate).
  app.route("/health", health);
  // Public widget ingest - auth is project key + origin allowlist, not a session.
  app.route("/ingest", ingest);
  // Public signed file links, embedded in external tickets (GitHub issue bodies).
  app.route("/f", publicFiles);
  // Public marketing waitlist capture - CORS-scoped to the marketing origins.
  if (store.waitlist) app.route("/waitlist", createWaitlistRoute(options.marketingOrigins));
  // Public webhooks - authenticated by signature, not by a session, so they
  // must sit before the auth gate.
  if (deps.billing) app.route("/webhooks", dodoWebhook);
  if (store.integrations) app.route("/webhooks", githubWebhook);

  const { auth } = deps;
  if (auth) {
    // Dashboard SPA CORS scoped to /api/* only (credentials:true for the JWT
    // cookie). /ingest is cross-origin from arbitrary customer sites and sets
    // its own CORS.
    app.use("/api/*", cors({ origin: options.dashboardOrigin, credentials: true }));
    app.use("*", initAuthConfig(createAuthConfig(deps, auth)));
    // Auth.js endpoints: /api/auth/signin, /callback/google, /session, ...
    app.use("/api/auth/*", authHandler());
    // How email sign-in works here (link, code or both), for the login page.
    app.route("/api/sign-in-options", signInOptions);
    // Public: where a failed sign-in lands before it is sent on to the dashboard.
    app.route(AUTH_ERROR_PATH, authError);

    // Everything else under /api requires a valid session.
    app.use("/api/*", verifyAuth());

    // Session-only, no subscription needed: the dashboard shell has to render
    // for an unpaid Account, and checkout is how it stops being unpaid. Gating
    // these would leave the paywall with no exit. Invites likewise: joining a
    // paying Team is the other way in.
    app.route("/api/me", me);
    if (deps.billing) app.route("/api/billing", billing);
    if (store.teams) app.route("/api/invites", invitesRoute);

    // The paywall. Registered AFTER the open routes above, so their handlers
    // have already answered by the time this is reached - which is why this
    // can be a blanket /api/* rather than a list of prefixes. A prefix list is
    // easy to get wrong: "/api/projects/*" does not match "/api/projects"
    // itself, so the list endpoint would have slipped through ungated.
    if (deps.billing) app.use("/api/*", requireSubscription);
    app.route("/api/projects", projectsRoute);
    app.route("/api/issues", issuesRoute);
    app.route("/api/files", filesRoute);
    if (store.triage) app.route("/api/issues", triageRoute);
    if (store.features) {
      // /api/projects/:projectId/features and /api/features/:id
      app.route("/api", featuresRoute);
      app.route("/api/issues", issueFeatureRoute);
    }
    if (store.integrations) {
      app.route("/api/projects", destinationsRoute);
      app.route("/api/issues", issueDeliveriesRoute);
      app.route("/api/integrations", integrationsRoute);
    }
    if (store.teams) app.route("/api/teams", teamsRoute);
  }

  // The dashboard, on deployments that serve it from the API. Last, so every
  // API route above answers first.
  if (options.dashboardDir) app.route("/", dashboardRoute(options.dashboardDir));

  return app;
}
