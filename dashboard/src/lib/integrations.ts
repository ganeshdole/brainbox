import type { Delivery } from "@ganeshdole/brainbox-shared";

export type DeliveryTone = "ok" | "error" | "muted";

export interface DeliveryLabel {
  text: string;
  tone: DeliveryTone;
  href?: string;
}

const PROVIDER_NAME: Record<Delivery["provider"], string> = { github: "GitHub" };

export function deliveryLabel(d: Delivery): DeliveryLabel {
  const name = PROVIDER_NAME[d.provider];
  switch (d.status) {
    case "sent":
      return { text: d.externalId ? `${name} #${d.externalId}` : name, tone: "ok", href: d.url };
    case "failed":
      return { text: `${name}: ${d.error ?? "delivery failed"}`, tone: "error" };
    case "pending":
      return { text: `Sending to ${name}…`, tone: "muted" };
  }
}

/** Outcome of the GitHub install round-trip, from the `?github=` the backend redirects with. */
export function installResult(search: URLSearchParams): "connected" | "error" | null {
  const v = search.get("github");
  return v === "connected" || v === "error" ? v : null;
}

/** "bug, feedback ,," → ["bug", "feedback"], de-duplicated. */
export function parseLabels(input: string): string[] {
  return [...new Set(input.split(",").map((l) => l.trim()).filter(Boolean))];
}
