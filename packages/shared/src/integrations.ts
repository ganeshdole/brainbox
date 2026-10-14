export type IntegrationProvider = "github" | "azure-devops";

/** How Brainbox signs in to the tool: as our GitHub App, or with a personal
 *  access token the Customer pasted (Azure DevOps). */
export type ConnectionAuth = "app" | "pat";

/** `needs_reauth`: the tool rejected the stored credentials. Deliveries stop
 *  until someone connects again. */
export type ConnectionStatus = "active" | "needs_reauth";

/** Team-level link to an external tool: for GitHub, one App installation; for
 *  Azure DevOps, one organization and the token that reaches it. Credentials
 *  never leave the backend. */
export interface IntegrationConnection {
  id: string;
  provider: IntegrationProvider;
  externalId: string;
  label: string;
  auth: ConnectionAuth;
  status: ConnectionStatus;
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

/** Where a work item's sprint comes from. `current` is looked up at send time,
 *  so it follows the team's sprints. */
export type AzureDevopsIterationConfig =
  | { kind: "backlog"; path: string }
  | { kind: "current" }
  | { kind: "fixed"; path: string };

/** How one kind of report (bug or feature request) is filed. */
export interface AzureDevopsWorkItemConfig {
  /** "Bug", "User Story", ... as the project's process names it. */
  type: string;
  iteration: AzureDevopsIterationConfig;
  tags: string[];
  /** 1 (highest) to 4. Absent when the type has no Priority field. A feature
   *  request's importance overrides it. */
  priority?: number;
  /** Defaults for the type's required fields Brainbox doesn't fill. */
  fields: Array<{ referenceName: string; value: string }>;
  /** Where the report goes (Repro Steps for a Bug). Set by the backend on save. */
  bodyField: string;
  /** Where browser details go, for types that have System Info. Set by the backend. */
  systemInfoField?: string;
}

export interface AzureDevopsDestinationConfig {
  organization: string;
  project: { id: string; name: string };
  team: { id: string; name: string };
  /** Puts items on the team's board. */
  areaPath: string;
  /** Email of the person every item is assigned to. */
  assignedTo?: string;
  bug: AzureDevopsWorkItemConfig;
  feature: AzureDevopsWorkItemConfig;
}

/** Each provider's destination settings. */
export interface DestinationConfigs {
  github: GithubDestinationConfig;
  "azure-devops": AzureDevopsDestinationConfig;
}

export type DestinationConfig = DestinationConfigs[IntegrationProvider];

/** What the dashboard sends to save a destination: the config minus what the
 *  backend works out itself (the connection's organization, and where each
 *  type puts the report). */
export interface DestinationInputs {
  github: GithubDestinationConfig;
  "azure-devops": Omit<AzureDevopsDestinationConfig, "organization" | "bug" | "feature"> & {
    bug: Omit<AzureDevopsWorkItemConfig, "bodyField" | "systemInfoField">;
    feature: Omit<AzureDevopsWorkItemConfig, "bodyField" | "systemInfoField">;
  };
}

/** Where one project's reports go. One per provider per project; `config`
 *  narrows on `provider`. */
export type ProjectDestination = {
  [P in IntegrationProvider]: {
    id: string;
    projectId: string;
    connectionId: string;
    provider: P;
    config: DestinationConfigs[P];
    enabled: boolean;
    createdAt: string;
  };
}[IntegrationProvider];

/** What the dashboard's integrations section needs in one call. */
export interface IntegrationsState {
  github: { available: boolean };
  /** False when the deployment has no INTEGRATIONS_ENCRYPTION_KEY to keep tokens with. */
  azureDevops: { available: boolean };
  connections: IntegrationConnection[];
}

/** A repo a GitHub connection can file into. */
export interface IntegrationRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
}

// What an Azure DevOps connection offers the setup pickers. The catalog in
// @ganeshdole/brainbox-integrations returns these; the backend passes them on.

export interface AzureDevopsProject {
  id: string;
  name: string;
}

export interface AzureDevopsTeam {
  id: string;
  name: string;
}

/** Whether a team's board shows Bugs: beside stories on the backlog
 *  (`asRequirements`), on the sprint taskboard only (`asTasks`), or nowhere. */
export type AzureDevopsBugsBehavior = "asRequirements" | "asTasks" | "off";

export interface AzureDevopsIterationInfo {
  name: string;
  path: string;
  timeFrame?: "past" | "current" | "future";
}

/** What a team's board is made of: the areas it shows, and its sprints. */
export interface AzureDevopsTeamSettings {
  defaultAreaPath: string;
  areaPaths: string[];
  bugsBehavior: AzureDevopsBugsBehavior;
  backlogIteration: string;
  iterations: AzureDevopsIterationInfo[];
}

export interface AzureDevopsWorkItemType {
  name: string;
  color?: string;
}

export interface AzureDevopsField {
  referenceName: string;
  name: string;
  allowedValues: string[];
}

/** How a work item type is filled: where the report goes, and what else it demands. */
export interface AzureDevopsWorkItemTypeInfo {
  bodyField: string;
  systemInfoField?: string;
  hasPriority: boolean;
  /** Always-required fields with no default that Brainbox doesn't fill. */
  required: AzureDevopsField[];
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
