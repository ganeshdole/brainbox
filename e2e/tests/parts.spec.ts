import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { PARTS_BACKEND_LOG, PARTS_DASHBOARD_URL, partsBackendEnv } from "../env.ts";
import { person, signIn } from "./people.ts";

// A backend built from parts (backend/scripts/e2e-parts-backend.ts): its store
// has only the core, sign-in and Teams, and it has no billing or Google
// client. The dashboard in front of it should offer only that, and never call
// an API the backend doesn't serve.

function seed(): { projectId: string; email: string } {
  const out = execFileSync("pnpm", ["exec", "tsx", "scripts/seed-e2e-parts.ts"], {
    cwd: join(import.meta.dirname, "../../backend"),
    env: { ...process.env, ...partsBackendEnv },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").at(-1) ?? "") as { projectId: string; email: string };
}

test("a dashboard over a backend without triage, features or trackers shows only what it has", async ({
  browser,
}, testInfo) => {
  const { projectId, email } = seed();
  const lin = await person(browser, testInfo, "Lin", email, PARTS_DASHBOARD_URL);
  const { page } = lin;
  const project = `/projects/${projectId}`;
  // Anything the backend doesn't serve answers 404; the dashboard should never ask.
  const missing: string[] = [];
  page.on("response", (res) => {
    if (res.status() === 404 && new URL(res.url()).pathname.startsWith("/api/")) missing.push(res.url());
  });

  await test.step("sign in by email only", async () => {
    await lin.say("signs in: this backend has no Google client, so no Google button");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
    await signIn(lin, PARTS_BACKEND_LOG);
  });

  await test.step("one list of reports, feature requests included", async () => {
    await page.goto(project);
    await lin.say("sees every report in one list: no triage tabs, no Features page");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("listitem").filter({ hasText: "Let me save my cart for later" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Inbox \d+$/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Features/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Team" }).first()).toBeVisible();
  });

  await test.step("an old link to Features lands on the reports", async () => {
    await page.goto(`${project}/features`);
    await expect(page).toHaveURL(new RegExp(`${project}$`));
  });

  await test.step("a report without triage or deliveries", async () => {
    await page.getByRole("link", { name: /Checkout button overlaps the total/ }).click();
    await expect(page.getByRole("heading", { name: "Checkout button overlaps the total" })).toBeVisible();
    await lin.say("opens a report: no status, priority or Send to");
    await expect(page.locator("ol", { hasText: "Reported" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "No priority" })).toHaveCount(0);
    await expect(page.getByText(/^Send to /)).toHaveCount(0);
  });

  await test.step("settings without destinations", async () => {
    await page.goto(`${project}/settings`);
    await lin.say("opens Settings: domains and the key, no destinations");
    await expect(page.getByText("Domains", { exact: true })).toBeVisible();
    await expect(page.getByText("Destinations", { exact: true })).toHaveCount(0);
    // let the last frame sit in the video
    await page.waitForTimeout(1500);
  });

  expect(missing).toEqual([]);
  await lin.context.close();
});
