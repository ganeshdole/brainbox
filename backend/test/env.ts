import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Single source of truth for the test environment, imported by both
// vitest.config.ts (injected via test.env before any app import) and
// global-setup.ts. Reads backend/.env.test if present, else local defaults
// (the native Postgres on this box; brainbox role has CREATEDB).
function fromEnvTest(): Record<string, string> {
  try {
    const raw = readFileSync(join(import.meta.dirname, "../.env.test"), "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const file = fromEnvTest();

/** Which store the suite runs against: `TEST_STORE=convex pnpm test` for a
 *  local Convex deployment (see AGENTS.md), Postgres otherwise. */
export const TEST_STORE = process.env.TEST_STORE === "convex" ? "convex" : "postgres";

/** Set on the local Convex deployment too: `npx convex env set
 *  BRAINBOX_SERVER_SECRET brainbox-test-server-secret`. */
export const TEST_SERVER_SECRET = "brainbox-test-server-secret";

/** The local deployment `npx convex dev` wrote to backend/.env.local. */
function localConvexUrl(): string {
  try {
    const raw = readFileSync(join(import.meta.dirname, "../.env.local"), "utf8");
    return raw.match(/^CONVEX_URL=(.+)$/m)?.[1]?.trim() ?? "http://127.0.0.1:3210";
  } catch {
    return "http://127.0.0.1:3210";
  }
}

// A fresh GitHub App key per run, so the real JWT path runs against a stubbed fetch.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const githubAppKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

export const testEnv: Record<string, string> = {
  DATABASE_URL:
    file.DATABASE_URL ?? "postgres://brainbox:brainbox@localhost:5432/brainbox_test",
  AUTH_SECRET: file.AUTH_SECRET ?? "test-secret-not-for-production-000000000000000=",
  DATABASE_DRIVER: TEST_STORE,
  ...(TEST_STORE === "convex" && {
    CONVEX_URL: process.env.CONVEX_URL ?? localConvexUrl(),
    BRAINBOX_SERVER_SECRET: TEST_SERVER_SECRET,
  }),
  // Files stay local in both modes: the /api/files tests cover that route.
  // test/convex.int.test.ts covers the Convex driver.
  STORAGE_DRIVER: "local",
  PUBLIC_API_URL: file.PUBLIC_API_URL ?? "http://localhost:8787",
  // Tells Auth.js it is mounted at /api/auth, as every deployment does.
  AUTH_URL: file.AUTH_URL ?? "http://localhost:8787/api/auth",
  GOOGLE_ID: "test",
  GOOGLE_SECRET: "test",
  // Log emails instead of sending them - tests never hit the network.
  EMAIL_DRIVER: "console",
  // Codes and links both, so the suite covers the code path and its attempt
  // limit as well as links.
  AUTH_EMAIL_MODE: "both",

  // Billing. A fixed webhook secret so tests can sign payloads the route will
  // actually accept; standardwebhooks wants base64 after the whsec_ prefix.
  // No DODO_API_KEY: tests must never be able to reach the payments API.
  DODO_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldC1ub3QtZm9yLXByb2Q=",
  DODO_ENVIRONMENT: "test_mode",
  DODO_PRODUCT_PRO_MONTHLY: "pdt_test_pro_monthly",
  DODO_PRODUCT_PRO_ANNUAL: "pdt_test_pro_annual",
  DODO_PRODUCT_BUSINESS_MONTHLY: "pdt_test_business_monthly",
  DODO_PRODUCT_BUSINESS_ANNUAL: "pdt_test_business_annual",

  GITHUB_APP_ID: "1",
  GITHUB_APP_SLUG: "brainbox-test",
  GITHUB_APP_PRIVATE_KEY: Buffer.from(githubAppKey).toString("base64"),
  GITHUB_APP_CLIENT_ID: "Iv1.test",
  GITHUB_APP_CLIENT_SECRET: "gh-client-secret-test",
  GITHUB_WEBHOOK_SECRET: "gh-webhook-test-secret",

  // Seals Azure DevOps tokens. Fixed, so a test can open what a route sealed.
  INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  // Azure DevOps service hooks in, the status webhook out (to a stubbed host).
  AZURE_DEVOPS_HOOK_SECRET: "ado-hook-test-secret",
  STATUS_WEBHOOK_URL: "https://status.test/brainbox",
  STATUS_WEBHOOK_SECRET: `whsec_${Buffer.from("status-webhook-test-secret").toString("base64")}`,
};
