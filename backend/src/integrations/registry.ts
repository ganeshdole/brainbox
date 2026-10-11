import { githubApp, githubIssues, type Destination, type GithubApp } from "@brainbox/integrations";
import type { IntegrationProvider } from "@brainbox/shared";

import type { integrationConnections, projectDestinations } from "../db/schema/index.ts";
import { env } from "../env.ts";

export type DestinationRow = typeof projectDestinations.$inferSelect;
export type ConnectionRow = typeof integrationConnections.$inferSelect;

const FACTORIES: Record<IntegrationProvider, (dest: DestinationRow, conn: ConnectionRow) => Destination> = {
  github: (dest, conn) =>
    githubIssues({
      owner: dest.config.owner,
      repo: dest.config.repo,
      labels: dest.config.labels,
      token: () => getGithubApp().installationToken(conn.externalId),
    }),
};

export function destinationFor(dest: DestinationRow, conn: ConnectionRow): Destination {
  return FACTORIES[dest.provider](dest, conn);
}

export function integrationsConfigured(provider: IntegrationProvider): boolean {
  switch (provider) {
    case "github":
      return [
        env.GITHUB_APP_ID,
        env.GITHUB_APP_SLUG,
        env.GITHUB_APP_PRIVATE_KEY,
        env.GITHUB_APP_CLIENT_ID,
        env.GITHUB_APP_CLIENT_SECRET,
      ].every((v) => v !== "");
  }
}

let app: GithubApp | null = null;

export function getGithubApp(): GithubApp {
  if (app) return app;
  if (!integrationsConfigured("github")) {
    throw new Error(
      "GitHub App is not configured (set GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET)",
    );
  }
  app = githubApp({
    appId: env.GITHUB_APP_ID,
    privateKey: decodePrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    clientId: env.GITHUB_APP_CLIENT_ID,
    clientSecret: env.GITHUB_APP_CLIENT_SECRET,
  });
  return app;
}

export function decodePrivateKey(value: string): string {
  if (value.includes("-----BEGIN")) return value;
  return Buffer.from(value, "base64").toString("utf8");
}
