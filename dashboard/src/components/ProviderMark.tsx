import type { IntegrationProvider } from "@ganeshdole/brainbox-shared";

import { GithubMark } from "./GithubMark";

export function AzureDevopsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden>
      <path
        fill="#0078d4"
        d="M17 4v9.74l-4 3.28-6.2-2.26V17l-3.51-4.59 10.23.8V4.44zm-3.41.49L7.85 1v2.29L2.58 4.84 1 6.87v4.61l2.26 1V6.57z"
      />
    </svg>
  );
}

/** The logo of the tool a delivery or destination belongs to. */
export function ProviderMark({ provider, className }: { provider: IntegrationProvider; className?: string }) {
  return provider === "github" ? <GithubMark className={className} /> : <AzureDevopsMark className={className} />;
}
