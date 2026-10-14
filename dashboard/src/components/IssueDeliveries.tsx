import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import type { Delivery } from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import type { IntegrationProvider } from "@ganeshdole/brainbox-shared";

import { deliveryLabel, PROVIDER_NAME } from "../lib/integrations";
import { ProviderMark } from "./ProviderMark";
import { Button } from "./ui/button";

const TONE = { ok: "text-default", error: "text-error", muted: "text-muted" } as const;

export function IssueDeliveries({
  issueId,
  projectId,
  deliveries,
  onChange,
}: {
  issueId: string;
  projectId: string;
  deliveries: Delivery[];
  onChange: (next: Delivery[]) => void;
}) {
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listDestinations(projectId)
      .then((list) => {
        if (!cancelled) setProviders(list.map((d) => d.provider));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function send(provider?: IntegrationProvider) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.sendIssue(issueId, provider));
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (deliveries.length === 0 && providers.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {deliveries.map((d) => {
        const label = deliveryLabel(d);
        return (
          <span key={d.id} className={`flex min-w-0 items-center gap-1.5 ${TONE[label.tone]}`}>
            <ProviderMark provider={d.provider} className="size-3.5 shrink-0" />
            {label.href ? (
              <a
                href={label.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 transition hover:text-link"
              >
                {label.text} <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="truncate">{label.text}</span>
            )}
            {d.status === "failed" && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send(d.provider)}>
                <RotateCw /> Retry
              </Button>
            )}
          </span>
        );
      })}
      {deliveries.length === 0 && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void send()}>
          {providers.map((p) => (
            <ProviderMark key={p} provider={p} className="size-3.5" />
          ))}{" "}
          {busy ? "Sending…" : `Send to ${providers.map((p) => PROVIDER_NAME[p]).join(" and ")}`}
        </Button>
      )}
      {error && <span className="text-error">{error}</span>}
    </div>
  );
}
