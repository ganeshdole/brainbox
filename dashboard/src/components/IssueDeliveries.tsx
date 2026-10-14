import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import type { Delivery, IntegrationProvider } from "@ganeshdole/brainbox-shared";

import { api, isAuthRedirect } from "../lib/api";
import { deliveryLabel, PROVIDER_NAME, workItemSummary } from "../lib/integrations";
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

  async function send() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.sendIssue(issueId));
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function renotify(delivery: Delivery, updateId: string) {
    setBusy(true);
    setError(null);
    try {
      const workItem = await api.renotifyWorkItemUpdate(issueId, updateId);
      onChange(deliveries.map((d) => (d.id === delivery.id ? { ...d, workItem } : d)));
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
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void send()}>
                <RotateCw /> Retry
              </Button>
            )}
            {d.workItem && (
              <span className="truncate text-muted" title={workItemSummary(d.workItem).detail}>
                · {workItemSummary(d.workItem).text}
              </span>
            )}
            {d.workItem?.notification?.status === "failed" && (
              <>
                <span className="text-error">
                  · Couldn't tell your app: {d.workItem.notification.error ?? "failed"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => d.workItem && void renotify(d, d.workItem.id)}
                >
                  <RotateCw /> Retry
                </Button>
              </>
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
