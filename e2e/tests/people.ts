import { readFile } from "node:fs/promises";

import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import { BACKEND_LOG } from "../env.ts";

// One person at their own browser: a separate context, so a separate session,
// recorded to its own video. A caption bar at the bottom says who they are and
// what they are doing, so the recordings can be watched side by side.

export interface Person {
  name: string;
  email: string;
  context: BrowserContext;
  page: Page;
  /** Sets the caption under the page. */
  say(text: string): Promise<void>;
}

const CAPTION_KEY = "e2e:caption";

export async function person(
  browser: Browser,
  testInfo: TestInfo,
  name: string,
  email: string,
): Promise<Person> {
  const context = await browser.newContext({
    // Signed out, whatever the config's default browser state.
    storageState: { cookies: [], origins: [] },
    recordVideo: { dir: testInfo.outputPath("videos", name.toLowerCase()), size: { width: 1280, height: 800 } },
    viewport: { width: 1280, height: 800 },
  });
  // Re-drawn on every page load, from what say() last stored.
  await context.addInitScript(
    ([who, key]) => {
      const draw = () => {
        let bar = document.getElementById("e2e-caption");
        if (!bar) {
          bar = document.createElement("div");
          bar.id = "e2e-caption";
          bar.setAttribute(
            "style",
            "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;" +
              "padding:10px 16px;font:500 15px/1.4 -apple-system,system-ui,sans-serif;" +
              "background:rgba(37,99,235,.92);color:#fff;display:flex;gap:12px",
          );
          document.documentElement.appendChild(bar);
        }
        const text = sessionStorage.getItem(key) ?? "";
        bar.innerHTML = "";
        const label = document.createElement("strong");
        label.textContent = who;
        const step = document.createElement("span");
        step.textContent = text;
        bar.append(label, step);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw);
      else draw();
      window.addEventListener("e2e-caption", draw);
    },
    [name, CAPTION_KEY] as const,
  );
  const page = await context.newPage();
  const who: Person = {
    name,
    email,
    context,
    page,
    async say(text) {
      await page
        .evaluate(
          ([key, value]) => {
            sessionStorage.setItem(key, value);
            window.dispatchEvent(new Event("e2e-caption"));
          },
          [CAPTION_KEY, text] as const,
        )
        // about:blank has no sessionStorage; the next page load draws it.
        .catch(() => undefined);
    },
  };
  // Start on the sign-in page, so a recording never opens on a blank tab.
  await page.goto("/login");
  await who.say("is signed out");
  return who;
}

/** The newest sign-in code the console email driver logged for `email`, once
 *  one newer than `after` (a count of codes already sent) appears. */
async function waitForCode(email: string, after: number): Promise<string> {
  const pattern = new RegExp(
    `\\[email:console\\] to=${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} subject="Your Brainbox sign-in code"\\n[\\s\\S]*?Your code: (\\d{6})`,
    "g",
  );
  for (let tries = 0; tries < 100; tries++) {
    const codes = [...(await readFile(BACKEND_LOG, "utf8")).matchAll(pattern)].map((m) => m[1]);
    const code = codes.length > after ? codes[codes.length - 1] : undefined;
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no sign-in code was emailed to ${email}`);
}

/** How many codes have been emailed to `email` so far. */
export async function codesSent(email: string): Promise<number> {
  const log = await readFile(BACKEND_LOG, "utf8").catch(() => "");
  return log.split(`[email:console] to=${email} subject="Your Brainbox sign-in code"`).length - 1;
}

/** Signs in on the login page the browser is on, with an emailed code. */
export async function signIn(who: Person): Promise<void> {
  const { page } = who;
  await expect(page.getByRole("heading", { name: "Welcome to Brainbox" })).toBeVisible();
  const before = await codesSent(who.email);
  await page.getByPlaceholder("you@company.com").fill(who.email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  const code = await waitForCode(who.email, before);
  await page.getByPlaceholder("123456").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
