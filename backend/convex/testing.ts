import type { TableNames } from "./_generated/dataModel";
import { serverMutation, serverQuery, strip } from "./lib/server.ts";

// For the backend's integration suite only (test/harness.ts). Every function
// refuses to run unless the deployment sets BRAINBOX_ALLOW_TEST_RESET=true,
// which a production deployment must never do.

function assertTestDeployment(): void {
  if (process.env.BRAINBOX_ALLOW_TEST_RESET !== "true") {
    throw new Error("testing functions are disabled on this deployment");
  }
}

const TABLES: TableNames[] = [
  "users",
  "authAccounts",
  "verificationTokens",
  "signInAttempts",
  "projects",
  "issues",
  "features",
  "connections",
  "destinations",
  "deliveries",
  "subscriptions",
  "webhookEvents",
  "waitlistSignups",
  "files",
];

/** Empties every table and the stored files: a clean slate before each test. */
export const reset = serverMutation({
  args: {},
  handler: async (ctx) => {
    assertTestDeployment();
    for (const file of await ctx.db.query("files").collect()) await ctx.storage.delete(file.storageId);
    for (const table of TABLES) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }
  },
});

// Whole tables the Store has no reason to list, for assertions.

export const connections = serverQuery({
  args: {},
  handler: async (ctx) => {
    assertTestDeployment();
    return (await ctx.db.query("connections").collect()).map(strip);
  },
});

export const destinations = serverQuery({
  args: {},
  handler: async (ctx) => {
    assertTestDeployment();
    return (await ctx.db.query("destinations").collect()).map(strip);
  },
});

export const webhookEvents = serverQuery({
  args: {},
  handler: async (ctx) => {
    assertTestDeployment();
    return (await ctx.db.query("webhookEvents").collect()).map(strip);
  },
});

export const waitlistSignups = serverQuery({
  args: {},
  handler: async (ctx) => {
    assertTestDeployment();
    return (await ctx.db.query("waitlistSignups").collect()).map(strip);
  },
});
