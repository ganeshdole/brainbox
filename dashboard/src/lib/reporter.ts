import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";

/** Where a field's value links to, or null when it should show as text. Only
 *  http(s) URLs become links: the value comes from the host app, and a
 *  `javascript:` one must never be clickable. */
export function fieldHref({ type, value }: Pick<ReportField, "type" | "value">): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === "email") return `mailto:${trimmed}`;
  if (type === "phone") return `tel:${trimmed.replace(/[^\d+]/g, "")}`;
  if (type === "url") {
    try {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Two letters for the reporter's avatar: from the name, else the email. */
export function initials({ name, email }: Identity): string {
  const [first = "", ...rest] = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const last = rest.at(-1);
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  return (first || email || "").slice(0, 2).toUpperCase();
}

/** True when the report says anything about who filed it. */
export function hasReporter(identity: Identity | undefined): identity is Identity {
  return Boolean(identity?.name || identity?.email || identity?.phone || identity?.id);
}
