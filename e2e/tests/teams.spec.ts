import { expect, test, type Page } from "@playwright/test";

import { codesSent, person, signIn, type Person } from "./people.ts";

// Teams end to end (ADR 0008): an Owner sets up a project, invites a
// teammate, the teammate joins and works in it, and loses it when removed.
// The deployment sends no email, so invites travel as copied links, and only
// acme.test addresses may sign in without one.

/** Signs in a new Owner, creates their first project and names their Team. */
async function ownerWithProject(owner: Person, project: string, team: string): Promise<void> {
  const { page } = owner;
  await page.goto("/login");
  await owner.say("signs in with an emailed code");
  await signIn(owner);

  await owner.say(`creates the project ${project}`);
  await page.getByPlaceholder("Project name - e.g. Nidana").fill(project);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);

  await owner.say(`opens Team and names it ${team}`);
  await nav(page, "Team").click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  const name = page.locator("form").filter({ has: page.getByRole("button", { name: "Save" }) }).getByRole("textbox");
  await name.fill(team);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Everyone here sees every project in ${team}`)).toBeVisible();
}

/** Invites `email` from the Team page and returns the link to pass on. */
async function invite(owner: Person, email: string, role: "Member" | "Admin" = "Member"): Promise<string> {
  const { page } = owner;
  await owner.say(`invites ${email} as ${role}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText("This deployment doesn't send email.")).toBeVisible();
  const link = await page.locator("code").filter({ hasText: "/invite/" }).textContent();
  if (!link) throw new Error("no invite link shown");
  await owner.say("copies the invite link to send by chat");
  return link.trim();
}

/** A link in the sidebar, as opposed to one in the page's own content. */
function nav(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

function memberRow(page: Page, email: string) {
  return page.getByRole("listitem").filter({ hasText: email });
}

test("an Owner invites a teammate, who joins, works in the project, and is removed", async ({ browser }, testInfo) => {
  const owner = await person(browser, testInfo, "Owner", "owner@acme.test");
  const mate = await person(browser, testInfo, "Teammate", "sam@acme.test");
  owner.page.on("dialog", (dialog) => void dialog.accept());

  await mate.page.goto("/login");
  await mate.say("waits for an invite");

  await ownerWithProject(owner, "Acme Web", "Acme");
  const link = await invite(owner, mate.email);
  await expect(memberRow(owner.page, mate.email).getByRole("button", { name: "Revoke" })).toBeVisible();
  // The only Owner cannot leave, so is not offered to.
  await expect(memberRow(owner.page, owner.email).getByRole("button", { name: "Leave" })).toHaveCount(0);

  await test.step("the teammate opens the link, signs in and joins", async () => {
    await mate.page.goto(link);
    await mate.say("opens the invite link and signs in");
    await signIn(mate);
    await expect(mate.page).toHaveURL(/\/invite\//);
    await mate.say("sees who invited them, and joins");
    await expect(mate.page.getByRole("heading", { name: "Join Acme" })).toBeVisible();
    await mate.page.getByRole("button", { name: "Join Acme" }).click();
    await expect(mate.page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    await mate.say("is in: the team's project and its reports");
    await expect(mate.page.getByRole("button", { name: "Acme Web" }).first()).toBeVisible();
  });

  await test.step("as a Member, settings are read-only and the Team page offers no invites", async () => {
    await nav(mate.page, "Settings").click();
    await mate.say("as a Member, sees settings read-only");
    await expect(mate.page.getByText("Team admins change domains and integrations.")).toBeVisible();
    await expect(mate.page.getByText("Danger zone")).toHaveCount(0);

    await nav(mate.page, "Team").click();
    await mate.say("sees who else is in the team");
    await expect(memberRow(mate.page, owner.email)).toContainText("Owner");
    await expect(mate.page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
  });

  await test.step("the Owner sees them join and makes them an Admin", async () => {
    await owner.page.reload();
    await owner.say(`sees ${mate.email} joined, and makes them an Admin`);
    await expect(memberRow(owner.page, mate.email)).toBeVisible();
    await expect(owner.page.getByText("Pending invites")).toHaveCount(0);
    await owner.page.getByLabel(`Role for ${mate.email}`).selectOption("admin");
    await expect(owner.page.getByLabel(`Role for ${mate.email}`)).toHaveValue("admin");

    await nav(mate.page, "Settings").click();
    await mate.page.reload();
    await mate.say("as an Admin, can now change settings");
    await expect(mate.page.getByText("Danger zone")).toBeVisible();
  });

  await test.step("the Owner removes them, and they lose the project at once", async () => {
    await owner.say(`removes ${mate.email}`);
    await memberRow(owner.page, mate.email).getByRole("button", { name: "Remove" }).click();
    await expect(memberRow(owner.page, mate.email)).toHaveCount(0);

    await mate.page.reload();
    await mate.say("reloads: the project is gone");
    await expect(mate.page.getByText("isn't in a team you belong to")).toBeVisible();
  });

  await owner.context.close();
  await mate.context.close();
});

test("an invite only works for the address it was sent to", async ({ browser }, testInfo) => {
  const owner = await person(browser, testInfo, "Owner", "lead@acme.test");
  const other = await person(browser, testInfo, "Colleague", "colleague@acme.test");

  await ownerWithProject(owner, "Billing App", "Payments");
  const link = await invite(owner, "jo@acme.test");

  await other.page.goto(link);
  await other.say("opens a link meant for someone else");
  await signIn(other);
  await expect(other.page.getByRole("heading", { name: "This invite is for another address" })).toBeVisible();
  await expect(other.page.getByText("It was sent to jo@acme.test")).toBeVisible();
  await expect(other.page.getByRole("button", { name: /^Join/ })).toHaveCount(0);

  await owner.context.close();
  await other.context.close();
});

test("only the company's domain signs in, unless a Team invites someone", async ({ browser }, testInfo) => {
  const owner = await person(browser, testInfo, "Owner", "head@acme.test");
  const outsider = await person(browser, testInfo, "Contractor", "pat@gmail.test");

  await test.step("an outside address is refused, and no code is sent", async () => {
    await outsider.page.goto("/login");
    await outsider.say("tries to sign in from outside the company");
    await outsider.page.getByPlaceholder("you@company.com").fill(outsider.email);
    await outsider.page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await expect(outsider.page.getByText("Ask a team admin to invite you")).toBeVisible();
    expect(await codesSent(outsider.email)).toBe(0);
  });

  await ownerWithProject(owner, "Docs Site", "Docs");
  const link = await invite(owner, outsider.email);

  await test.step("once invited, they sign in and join", async () => {
    await outsider.page.goto(link);
    await outsider.say("is invited, so can sign in");
    await signIn(outsider);
    await outsider.page.getByRole("button", { name: "Join Docs" }).click();
    await expect(outsider.page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    await expect(outsider.page.getByRole("button", { name: "Docs Site" }).first()).toBeVisible();
  });

  await owner.context.close();
  await outsider.context.close();
});

test("a Team with no projects left stays reachable, and an Admin restocks it", async ({ browser }, testInfo) => {
  const owner = await person(browser, testInfo, "Owner", "boss@acme.test");
  const admin = await person(browser, testInfo, "Admin", "kim@acme.test");

  await ownerWithProject(owner, "Old Site", "Studio");
  const link = await invite(owner, admin.email, "Admin");
  await admin.page.goto(link);
  await signIn(admin);
  await admin.page.getByRole("button", { name: "Join Studio" }).click();
  await expect(admin.page).toHaveURL(/\/projects\//);

  await test.step("the Owner deletes the Team's only project, and can still manage the Team", async () => {
    await nav(owner.page, "Settings").click();
    await owner.say("deletes the team's only project");
    await owner.page.getByRole("button", { name: "Delete project" }).click();
    await owner.page.getByPlaceholder("Old Site").fill("Old Site");
    await owner.page.getByRole("button", { name: "Delete this project" }).click();
    await expect(owner.page.getByRole("heading", { name: "Create a project in Studio" })).toBeVisible();

    await owner.say("still reaches the empty team");
    await owner.page.getByRole("link", { name: "Manage Studio" }).click();
    await expect(owner.page).toHaveURL(/\/teams\//);
    await expect(memberRow(owner.page, admin.email)).toBeVisible();
  });

  await test.step("the Admin creates the replacement project in the same Team", async () => {
    await admin.page.goto("/");
    await admin.say("creates the replacement project in Studio");
    await expect(admin.page.getByRole("heading", { name: "Create a project in Studio" })).toBeVisible();
    await admin.page.getByPlaceholder("Project name - e.g. Nidana").fill("New Site");
    await admin.page.getByRole("button", { name: "Create project" }).click();
    await expect(admin.page).toHaveURL(/\/projects\/[0-9a-f-]+$/);

    await owner.page.goto("/");
    await expect(owner.page.getByRole("button", { name: "New Site" }).first()).toBeVisible();
  });

  await owner.context.close();
  await admin.context.close();
});

test("joining a Team that has no projects lands on the Team", async ({ browser }, testInfo) => {
  const owner = await person(browser, testInfo, "Owner", "founder@acme.test");
  const mate = await person(browser, testInfo, "Teammate", "lee@acme.test");
  owner.page.on("dialog", (dialog) => void dialog.accept());

  await ownerWithProject(owner, "Temp", "Labs");
  const link = await invite(owner, mate.email);
  await nav(owner.page, "Settings").click();
  await owner.page.getByRole("button", { name: "Delete project" }).click();
  await owner.page.getByPlaceholder("Temp").fill("Temp");
  await owner.page.getByRole("button", { name: "Delete this project" }).click();
  await expect(owner.page.getByRole("heading", { name: "Create a project in Labs" })).toBeVisible();

  await mate.page.goto(link);
  await signIn(mate);
  await mate.page.getByRole("button", { name: "Join Labs" }).click();
  await expect(mate.page).toHaveURL(/\/teams\//);
  await expect(mate.page.getByText("Everyone here sees every project in Labs")).toBeVisible();
  await expect(memberRow(mate.page, owner.email)).toContainText("Owner");

  await owner.context.close();
  await mate.context.close();
});
