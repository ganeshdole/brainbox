import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { backendEnv } from "../env.ts";
import { person, signIn } from "./people.ts";

// Triage end to end: one Customer works a project's reports from the Inbox to
// Done. The reports are seeded straight into the database the run's reset
// just created (backend/scripts/seed-e2e-triage.ts), as if the widget had sent
// them.

function seed(): { projectId: string; email: string } {
  const out = execFileSync("pnpm", ["exec", "tsx", "scripts/seed-e2e-triage.ts"], {
    cwd: join(import.meta.dirname, "../../backend"),
    env: { ...process.env, ...backendEnv },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").at(-1) ?? "") as { projectId: string; email: string };
}

const tab = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name} \\d+$`) });
const activity = (page: Page) => page.locator("ol", { hasText: "Reported" });

test("a Customer triages reports from the Inbox to Done", async ({ browser }, testInfo) => {
  const { projectId, email } = seed();
  const ada = await person(browser, testInfo, "Ada", email);
  const { page } = ada;

  await test.step("sign in", async () => {
    await ada.say("signs in with an emailed code");
    await signIn(ada);
  });

  await test.step("new reports wait in the Inbox", async () => {
    await page.goto(`/projects/${projectId}`);
    await expect(tab(page, "Inbox")).toHaveAttribute("aria-pressed", "true");
    await ada.say("sees new reports waiting in the Inbox");
    await expect(tab(page, "Inbox")).toHaveText("Inbox 3");
    await expect(tab(page, "Open")).toHaveText("Open 2");
    await expect(tab(page, "Done")).toHaveText("Done 1");
    await expect(page.getByRole("listitem")).toHaveCount(3);
  });

  await test.step("resolve two reports at once", async () => {
    await ada.say("ticks two reports and resolves them in one go");
    await page.getByRole("checkbox", { name: /Chart labels overlap/ }).check();
    await page.getByRole("checkbox", { name: /Typo in the onboarding/ }).check();
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("button", { name: "Set status" }).click();
    await page.getByRole("menuitem", { name: "Resolved" }).click();
    await expect(tab(page, "Inbox")).toHaveText("Inbox 1");
    await expect(tab(page, "Done")).toHaveText("Done 3");
  });

  await test.step("accept the last one with the A shortcut", async () => {
    await page.getByRole("link", { name: /Save button does nothing/ }).click();
    await expect(page.getByRole("heading", { name: "Save button does nothing on the billing page" })).toBeVisible();
    await ada.say("opens a report and presses A to accept it");
    await expect(activity(page)).toBeVisible();
    await page.keyboard.press("a");
    await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
    await expect(activity(page)).toContainText("Ada Lovelace changed status from New to Open");
  });

  await test.step("make it urgent", async () => {
    await ada.say("sets its priority; every change is logged in Activity");
    await page.getByRole("button", { name: "No priority" }).click();
    await page.getByRole("menuitem", { name: "Urgent" }).click();
    await expect(page.getByRole("button", { name: "Urgent" })).toBeVisible();
    await expect(activity(page)).toContainText("changed priority from No priority to Urgent");
  });

  await test.step("close it as a duplicate, then reopen it", async () => {
    await ada.say("closes it as a duplicate (closing always asks why)");
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.getByRole("button", { name: "Closed" })).toBeVisible();
    await expect(page.getByText("Duplicate", { exact: true })).toBeVisible();

    await ada.say("reopens it");
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
    await expect(activity(page)).toContainText("changed status from Closed to Open");
  });

  await test.step("the change survives a reload", async () => {
    await page.reload();
    await ada.say("reloads: still open and urgent, saved on the server");
    await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Urgent" })).toBeVisible();
    await expect(activity(page).getByRole("listitem")).toHaveCount(7);
  });

  await test.step("the Inbox is empty and urgent work sorts first", async () => {
    await page.getByRole("link", { name: "Reports" }).first().click();
    await expect(tab(page, "Inbox")).toHaveText("Inbox 0");
    await ada.say("reaches Inbox zero; open work sorts urgent first");
    await tab(page, "Open").click();
    await page.getByLabel("Sort").selectOption("priority");
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Save button does nothing");
    await expect(rows.nth(1)).toContainText("Export to CSV");
    await expect(rows.nth(2)).toContainText("Dark mode toggle");
    // let the last frame sit in the video
    await page.waitForTimeout(1500);
  });

  await ada.context.close();
});
