import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { API_URL, FAKE_ADO_URL, backendEnv } from "../env.ts";
import { person, signIn } from "./people.ts";

// Azure DevOps end to end, against the local fake (backend/scripts/
// fake-azure-devops.ts): a Customer connects with a token and picks a team's
// board, then a report sent the way a host app sends it (screenshot,
// screen recording, voice note, host fields) lands there as a work item with
// all three attached.

function seed(): { projectId: string; projectKey: string; email: string } {
  // node with tsx rather than pnpm: no shell needed, so it runs on Windows too.
  const out = execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-azure-devops.ts"], {
    cwd: join(import.meta.dirname, "../../backend"),
    env: { ...process.env, ...backendEnv },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").at(-1) ?? "") as { projectId: string; projectKey: string; email: string };
}

test("a report from the app becomes an Azure DevOps work item with its files", async ({ browser, request }, testInfo) => {
  const { projectId, projectKey, email } = seed();
  const grace = await person(browser, testInfo, "Grace", email);
  const { page } = grace;
  const card = page.locator("div.rounded-xl", { hasText: "Azure DevOps" }).last();

  await test.step("sign in", async () => {
    await grace.say("signs in with an emailed code");
    await signIn(grace);
  });

  await test.step("connect Azure DevOps with a token", async () => {
    await page.goto(`/projects/${projectId}/settings`);
    await grace.say("connects Azure DevOps with an organization and a personal access token");
    await card.getByLabel("Organization").fill("acme");
    await card.getByLabel("Personal access token").fill("fake-pat");
    await card.getByRole("button", { name: "Connect" }).click();
    await expect(card.getByText("acme · token")).toBeVisible();
  });

  await test.step("pick the team's board and save", async () => {
    await grace.say("picks the project and team; bugs go to the current sprint, feature requests to the backlog");
    await card.getByLabel("Project", { exact: true }).selectOption({ label: "Web Shop" });
    await card.getByLabel("Team", { exact: true }).selectOption({ label: "Checkout Team" });
    await expect(card.getByLabel("Area", { exact: true })).toHaveValue("Web Shop\\Checkout");
    await expect(card.getByLabel("Bugs: work item type")).toHaveValue("Bug");
    await expect(card.getByLabel("Feature requests: work item type")).toHaveValue("User Story");
    await card.getByRole("button", { name: /^Current sprint/ }).first().click();
    await card.getByRole("button", { name: "Send reports to Azure DevOps" }).click();
    await expect(card.getByText("Sending", { exact: true })).toBeVisible();
  });

  await test.step("send a test report", async () => {
    await grace.say("sends a test report to see where it lands");
    await card.getByRole("button", { name: "Send a test report" }).click();
    await expect(card.getByText("Test report created")).toBeVisible();
  });

  let issueId = "";
  await test.step("the app sends a report", async () => {
    await grace.say("a customer reports a problem from the app: screenshot, recording and voice note");
    const res = await request.post(`${API_URL}/ingest`, {
      multipart: {
        json: JSON.stringify({
          projectKey,
          kind: "bug",
          text: "Invoice total doesn't include the shipping line",
          metadata: {
            url: "https://app.fabrikam.example/invoices/7",
            title: "Invoice 7",
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 2,
            userAgent: "Mozilla/5.0 Chrome/130",
            language: "en-US",
            timezone: "America/New_York",
            consoleErrors: ["TypeError: line.total is undefined"],
            identity: { id: "u-9", name: "Ana Lima", email: "ana@fabrikam.example" },
            fields: [
              { label: "Organization", value: "Fabrikam Retail" },
              { label: "Location", value: "Downtown" },
              { label: "Tenant ID", value: "ten-1" },
              { label: "Location ID", value: "loc-3" },
            ],
          },
        }),
        screenshot: { name: "s.png", mimeType: "image/png", buffer: await page.screenshot() },
        video: { name: "r.webm", mimeType: "video/webm", buffer: Buffer.alloc(2048, 1) },
        audio: { name: "v.webm", mimeType: "audio/webm", buffer: Buffer.alloc(512, 2) },
      },
    });
    expect(res.status()).toBe(201);
    issueId = ((await res.json()) as { id: string }).id;
  });

  await test.step("it was filed in Azure DevOps", async () => {
    await page.goto(`/projects/${projectId}/issues/${issueId}`);
    await grace.say("sees the report was filed in Azure DevOps");
    const delivered = page.getByRole("link", { name: /Azure DevOps #\d+/ });
    await expect(async () => {
      await page.reload();
      await expect(delivered).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    const href = await delivered.getAttribute("href");
    expect(href).toContain(FAKE_ADO_URL);

    await page.goto(href ?? "");
    await grace.say("opens the work item: screenshot inline, recording and voice note attached, host fields listed");
    await expect(page.getByRole("heading", { name: "Invoice total doesn't include the shipping line" })).toBeVisible();
    await expect(page.getByText("Attachments (3)")).toBeVisible();
    for (const name of ["screenshot.png", "recording.webm", "audio.webm"]) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Watch the recording" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Listen to the voice note" })).toBeVisible();
    await expect(page.locator(".rich img").first()).toBeVisible();
    for (const text of ["Ana Lima <ana@fabrikam.example>", "Fabrikam Retail", "Downtown", "ten-1", "loc-3"]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("Web Shop\\Sprint 42")).toBeVisible();
  });

  await grace.context.close();
});
