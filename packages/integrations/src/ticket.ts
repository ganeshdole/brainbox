import type { CapturedMetadata, Region } from "@ganeshdole/brainbox-shared";

/** A report as a destination needs it. `links` must work without a session. */
export interface Ticket {
  id: string;
  createdAt: string;
  text?: string;
  transcript?: string;
  metadata: CapturedMetadata;
  region?: Region;
  links: TicketLinks;
}

export interface TicketLinks {
  dashboard: string;
  screenshot?: string;
  crop?: string;
  replay?: string;
}

export interface RenderedTicket {
  title: string;
  body: string;
}

const TITLE_MAX = 72;
const CONSOLE_ERRORS_MAX = 20;

/** Title and Markdown body, shared by every ticket-shaped destination. */
export function renderTicket(ticket: Ticket): RenderedTicket {
  return { title: titleFor(ticket), body: bodyFor(ticket) };
}

function titleFor(t: Ticket): string {
  const spoken = firstLine(t.text) ?? firstLine(t.transcript);
  if (spoken) return truncate(spoken, TITLE_MAX);
  const page = t.metadata.title.trim() || t.metadata.url;
  return truncate(`Feedback on ${page}`, TITLE_MAX);
}

function bodyFor(t: Ticket): string {
  const parts: string[] = [];

  const image = t.links.crop ?? t.links.screenshot;
  if (image) {
    parts.push(`![${t.links.crop ? "Highlighted region" : "Screenshot"}](${image})`);
  }

  const text = t.text?.trim();
  if (text) parts.push(text);

  const transcript = t.transcript?.trim();
  if (transcript) parts.push(`**Voice note**\n\n${quote(transcript)}`);

  parts.push(detailsTable(t));

  if (t.metadata.consoleErrors.length > 0) {
    parts.push(consoleErrors(t.metadata.consoleErrors));
  }

  parts.push(footer(t));
  return `${parts.join("\n\n")}\n`;
}

function detailsTable(t: Ticket): string {
  const m = t.metadata;
  const user = m.identity?.email ?? m.identity?.id ?? "anonymous";
  const selector = t.region?.selector ?? m.selector;
  const rows: Array<[string, string]> = [
    ["Page", `[${cell(m.title.trim() || m.url)}](${m.url})`],
    ["Viewport", `${m.viewport.width} × ${m.viewport.height} @${m.devicePixelRatio}x`],
    ["Browser", cell(m.userAgent)],
    ["Locale", cell(`${m.language}, ${m.timezone}`)],
    ["User", cell(user)],
  ];
  if (selector) rows.push(["Element", `\`${cell(selector)}\``]);
  rows.push(["Reported", t.createdAt]);
  return ["| | |", "|---|---|", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
}

function consoleErrors(errors: string[]): string {
  const shown = errors.slice(0, CONSOLE_ERRORS_MAX).map((e) => e.replace(/```/g, "``​`"));
  const more = errors.length - shown.length;
  const label = `${errors.length} console error${errors.length === 1 ? "" : "s"}`;
  return [
    "<details>",
    `<summary>${label}</summary>`,
    "",
    "```",
    ...shown,
    ...(more > 0 ? [`… and ${more} more`] : []),
    "```",
    "",
    "</details>",
  ].join("\n");
}

function footer(t: Ticket): string {
  const links = [`[Open in Brainbox](${t.links.dashboard})`];
  if (t.links.replay) links.push(`[Session replay](${t.links.replay})`);
  if (t.links.screenshot && t.links.crop) links.push(`[Full screenshot](${t.links.screenshot})`);
  return links.join(" · ");
}

function firstLine(s: string | undefined): string | undefined {
  const line = s
    ?.split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ? line.replace(/\s+/g, " ") : undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function quote(s: string): string {
  return s
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}
