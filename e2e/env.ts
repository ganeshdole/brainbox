import { basename } from "node:path";
import { fileURLToPath } from "node:url";

// One place for the e2e stack's ports and settings, read by the Playwright
// config (to boot the servers) and the tests. Its own database and ports, so
// it never touches a dev stack or the backend's tests.

export const API_PORT = 8798;
export const DASHBOARD_PORT = 5184;
export const API_URL = `http://localhost:${API_PORT}`;
export const DASHBOARD_URL = `http://localhost:${DASHBOARD_PORT}`;

// One database per checkout (named after its folder), so two worktrees running
// e2e at once never drop or migrate each other's.
const checkout = basename(fileURLToPath(new URL("..", import.meta.url)))
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_");

/** Who may sign in without an invite (AUTH_ALLOWED_EMAIL_DOMAINS). */
export const COMPANY_DOMAIN = "acme.test";

/** The backend's output. The console email driver writes sign-in codes and
 *  invites here, which is how the tests read their email. */
export const BACKEND_LOG = new URL("test-results/backend.log", import.meta.url).pathname;

export const backendEnv: Record<string, string> = {
  DATABASE_DRIVER: "postgres",
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? `postgres://brainbox:brainbox@localhost:5432/brainbox_e2e_${checkout}`,
  AUTH_SECRET: "e2e-secret-not-for-production-0000000000000000=",
  AUTH_URL: `${API_URL}/api/auth`,
  DASHBOARD_ORIGIN: DASHBOARD_URL,
  PUBLIC_API_URL: API_URL,
  PORT: String(API_PORT),
  STORAGE_DRIVER: "local",
  EMAIL_DRIVER: "console",
  BILLING_DISABLED: "true",
  // Sign in with a 6-digit code read from BACKEND_LOG.
  AUTH_EMAIL_MODE: "code",
  AUTH_ALLOWED_EMAIL_DOMAINS: COMPANY_DOMAIN,
};
