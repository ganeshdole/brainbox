import {
  azureDevopsWorkItems,
  githubApp,
  githubIssues,
  type Destination,
  type GithubApp,
} from "@ganeshdole/brainbox-integrations";
import type { IntegrationProvider } from "@ganeshdole/brainbox-shared";

import type { ConnectionRecord, DestinationRecord } from "../store/types.ts";
import { authFor, workItemsOptions, type AzureDevopsSettings } from "./azure-devops.ts";

/** A GitHub App of your own (ADR 0006). */
export interface GithubAppSettings {
  appId: string;
  slug: string;
  /** PKCS#8 PEM, raw or base64. */
  privateKey: string;
  /** The app's OAuth client: proves the installing user owns the install. */
  clientId: string;
  clientSecret: string;
  /** Verifies /webhooks/github. Without it every event is refused. */
  webhookSecret?: string;
}

/** Which trackers this deployment can send to. A provider left out answers
 *  503 and the dashboard says it isn't set up. */
export interface IntegrationsOptions {
  github?: GithubAppSettings;
  azureDevops?: AzureDevopsSettings;
}

/** What the routes and delivery ask of a deployment's integrations. One per
 *  app, so the GitHub App's token cache lives and dies with it. */
export interface Integrations {
  readonly github: GithubAppSettings | null;
  readonly azureDevops: AzureDevopsSettings | null;
  /** Whether this deployment can use the provider. Routes answer 503 when not. */
  configured(provider: IntegrationProvider): boolean;
  /** Throws when GitHub isn't configured. */
  githubApp(): GithubApp;
  /** The `Destination` that sends to a stored destination, as its connection.
   *  Throws when the connection's credentials can't be read. */
  destinationFor(dest: DestinationRecord, conn: ConnectionRecord): Promise<Destination>;
}

/** What a feature request is labelled when its destination doesn't say:
 *  the label GitHub creates in every new repository for one. */
export const DEFAULT_FEATURE_LABELS = ["enhancement"];

export const PROVIDER_NAME: Record<IntegrationProvider, string> = {
  github: "GitHub",
  "azure-devops": "Azure DevOps",
};

export function createIntegrations(options: IntegrationsOptions = {}): Integrations {
  const github = options.github ?? null;
  const azureDevops = options.azureDevops ?? null;
  let app: GithubApp | null = null;

  const integrations: Integrations = {
    github,
    azureDevops,
    configured(provider) {
      switch (provider) {
        case "github":
          return github !== null;
        // Tokens are stored, so they need a key to be sealed with.
        case "azure-devops":
          return azureDevops !== null;
      }
    },
    githubApp() {
      if (!github) throw new Error("GitHub App is not configured");
      app ??= githubApp({
        appId: github.appId,
        privateKey: decodePrivateKey(github.privateKey),
        clientId: github.clientId,
        clientSecret: github.clientSecret,
      });
      return app;
    },
    async destinationFor(dest, conn) {
      switch (dest.provider) {
        case "github":
          return githubIssues({
            owner: dest.config.owner,
            repo: dest.config.repo,
            labels: dest.config.labels,
            // Destinations saved before feature requests have no featureLabels.
            featureLabels: dest.config.featureLabels ?? DEFAULT_FEATURE_LABELS,
            token: () => integrations.githubApp().installationToken(conn.externalId),
          });
        case "azure-devops": {
          if (!azureDevops) throw new Error("Azure DevOps is not configured");
          return azureDevopsWorkItems(workItemsOptions(azureDevops, dest.config, await authFor(azureDevops, conn)));
        }
      }
    },
  };
  return integrations;
}

export function decodePrivateKey(value: string): string {
  if (value.includes("-----BEGIN")) return value;
  return Buffer.from(value, "base64").toString("utf8");
}
