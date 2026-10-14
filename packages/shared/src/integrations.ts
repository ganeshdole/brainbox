export type IntegrationProvider = "github";

/** Account-level link to an external tool: for GitHub, one App installation. */
export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  externalId: string;
  label: string;
  createdAt: string;
}

export interface GithubDestinationConfig {
  owner: string;
  repo: string;
  labels: string[];
  /** Labels for feature requests, in place of `labels`. Absent on
   *  destinations saved before feature requests; those get `enhancement`. */
  featureLabels?: string[];
}

export type DestinationConfig = GithubDestinationConfig;

/** Where one project's reports go. One per provider per project. */
export interface ProjectDestination {
  id: string;
  projectId: string;
  connectionId: string;
  provider: IntegrationProvider;
  config: DestinationConfig;
  enabled: boolean;
  createdAt: string;
}

/** What the dashboard's integrations section needs in one call. */
export interface IntegrationsState {
  github: { available: boolean };
  connections: IntegrationConnection[];
}

/** A repo a GitHub connection can file into. */
export interface IntegrationRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
}

export type DeliveryStatus = "pending" | "sent" | "failed";

export interface Delivery {
  id: string;
  issueId: string;
  provider: IntegrationProvider;
  status: DeliveryStatus;
  externalId?: string;
  url?: string;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}
