import {
  azureDevopsWorkItems,
  githubApp,
  githubIssues,
  type Destination,
  type GithubApp,
} from "@ganeshdole/brainbox-integrations";
import type { IntegrationProvider } from "@ganeshdole/brainbox-shared";

import { env } from "../env.ts";
import type { ConnectionRecord, DestinationRecord } from "../store/index.ts";
import { authFor, workItemsOptions } from "./azure-devops.ts";

/** What a feature request is labelled when its destination doesn't say:
 *  the label GitHub creates in every new repository for one. */
export const DEFAULT_FEATURE_LABELS = ["enhancement"];

/** The `Destination` that sends to a stored destination, as its connection.
 *  Throws when the connection's credentials can't be read. */
export async function destinationFor(dest: DestinationRecord, conn: ConnectionRecord): Promise<Destination> {
  switch (dest.provider) {
    case "github":
      return githubIssues({
        owner: dest.config.owner,
        repo: dest.config.repo,
        labels: dest.config.labels,
        // Destinations saved before feature requests have no featureLabels.
        featureLabels: dest.config.featureLabels ?? DEFAULT_FEATURE_LABELS,
        token: () => getGithubApp().installationToken(conn.externalId),
      });
    case "azure-devops":
      return azureDevopsWorkItems(workItemsOptions(dest.config, await authFor(conn)));
  }
}

export const PROVIDER_NAME: Record<IntegrationProvider, string> = {
  github: "GitHub",
  "azure-devops": "Azure DevOps",
};

/** Whether this deployment can use the provider. Routes answer 503 when not. */
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
    // Tokens are stored, so they need a key to be sealed with.
    case "azure-devops":
      return env.INTEGRATIONS_ENCRYPTION_KEY !== "";
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
