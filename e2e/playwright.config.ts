import { defineConfig, devices } from "@playwright/test";

import { API_URL, BACKEND_LOG, DASHBOARD_PORT, DASHBOARD_URL, backendEnv } from "./env.ts";

// The real backend and dashboard over Postgres. The backend's database is
// recreated on every run (backend/scripts/reset-e2e-db.ts), which also proves
// the migrations apply from scratch. Every person a test signs in records a
// video into test-results/. SLOW_MO (ms) slows each action down for a video a
// person can follow.

const slowMo = Number(process.env.SLOW_MO ?? 0);

export default defineConfig({
  testDir: "./tests",
  // one database: tests share it, so they run one at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: DASHBOARD_URL,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    launchOptions: { slowMo },
  },
  webServer: [
    {
      // Logged to a file: the tests read sign-in codes from it.
      command: `mkdir -p "$(dirname ${BACKEND_LOG})" && pnpm exec tsx scripts/reset-e2e-db.ts && pnpm exec tsx src/index.ts > ${BACKEND_LOG} 2>&1`,
      cwd: "../backend",
      url: `${API_URL}/health`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${DASHBOARD_PORT} --strictPort`,
      cwd: "../dashboard",
      url: DASHBOARD_URL,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
