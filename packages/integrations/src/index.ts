export {
  resolveToken,
  type DeliveryResult,
  type Destination,
  type FetchLike,
  type TokenSource,
} from "./destination.ts";
export {
  renderTicket,
  renderTicketHtml,
  type HtmlRenderOptions,
  type RenderedHtmlTicket,
  type RenderedTicket,
  type Ticket,
  type TicketFile,
  type TicketFiles,
  type TicketLinks,
} from "./ticket.ts";

export { githubIssues, type GithubIssuesOptions } from "./github/issues.ts";
export {
  githubApp,
  type GithubApp,
  type GithubAppOptions,
  type GithubInstallation,
  type GithubRepo,
} from "./github/app.ts";
export { verifyGithubSignature } from "./github/webhook.ts";
export { GithubApiError } from "./github/client.ts";

export {
  azureDevopsWorkItems,
  validateWorkItem,
  type AzureDevopsIteration,
  type AzureDevopsWorkItemsOptions,
  type ValidationResult,
} from "./azure-devops/workitems.ts";
export {
  azureDevops,
  type AzureDevopsCatalog,
  type AzureDevopsCatalogOptions,
  type AzureDevopsField,
  type AzureDevopsIterationInfo,
  type AzureDevopsProject,
  type AzureDevopsTeam,
  type AzureDevopsTeamSettings,
  type AzureDevopsWorkItemType,
  type AzureDevopsWorkItemTypeInfo,
  type BugsBehavior,
} from "./azure-devops/catalog.ts";
export { AzureDevopsApiError, type AzureDevopsAuth } from "./azure-devops/client.ts";
export {
  entraApp,
  pkcePair,
  EntraError,
  AZURE_DEVOPS_SCOPE,
  type EntraAccount,
  type EntraApp,
  type EntraAppOptions,
  type EntraTokens,
} from "./azure-devops/entra.ts";
