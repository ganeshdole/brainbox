import type { CapturedMetadata, Identity, Region } from "@ganeshdole/brainbox-shared";

/** A report as a destination needs it. `links` must work without a session. */
export interface Ticket {
  id: string;
  createdAt: string;
  text?: string;
  transcript?: string;
  metadata: CapturedMetadata;
  region?: Region;
  links: TicketLinks;
  /** The images themselves, for trackers that host their own copy
   *  (Azure DevOps attachments). Destinations that link fall back to `links`. */
  files?: TicketFiles;
}

export interface TicketLinks {
  dashboard: string;
  screenshot?: string;
  crop?: string;
  replay?: string;
}

export interface TicketFiles {
  screenshot?: TicketFile;
  crop?: TicketFile;
}

/** One stored file, read only when a destination asks for it. */
export interface TicketFile {
  name: string;
  contentType: string;
  load(): Promise<Uint8Array>;
}

export interface RenderedTicket {
  title: string;
  body: string;
}

/** The HTML form, for trackers whose rich text is HTML (Azure DevOps). */
export interface RenderedHtmlTicket {
  title: string;
  body: string;
  /** Page, browser, viewport and locale on their own, for a "system info" field. */
  environment: string;
}

export interface HtmlRenderOptions {
  /** Replaces the inline image URL, e.g. with the tracker's own copy. */
  imageUrl?: string;
}

const TITLE_MAX = 72;
const CONSOLE_ERRORS_MAX = 20;

/** Title and Markdown body, shared by every ticket-shaped destination. */
export function renderTicket(ticket: Ticket): RenderedTicket {
  return { title: titleFor(ticket), body: markdownBody(contentOf(ticket)) };
}

/** The same ticket as HTML. Every value from the report is escaped. */
export function renderTicketHtml(ticket: Ticket, options: HtmlRenderOptions = {}): RenderedHtmlTicket {
  const content = contentOf(ticket);
  if (options.imageUrl) {
    const crop = ticket.links.crop ?? ticket.files?.crop;
    content.image = { url: options.imageUrl, alt: crop ? "Highlighted region" : "Screenshot" };
  }
  return {
    title: titleFor(ticket),
    body: htmlBody(content),
    environment: htmlTable(content.details.filter(([label]) => ENVIRONMENT.has(label))),
  };
}

// What a ticket says, before it is written as Markdown or HTML. A change to
// the wording goes here, once, for every format.

interface Cell {
  text: string;
  href?: string;
  code?: boolean;
}

type Row = [label: string, value: Cell];

interface Content {
  image?: { url: string; alt: string };
  text?: string;
  transcript?: string;
  details: Row[];
  consoleErrors: { shown: string[]; total: number };
  links: Array<{ label: string; url: string }>;
}

const ENVIRONMENT = new Set(["Page", "Viewport", "Browser", "Locale"]);

function titleFor(t: Ticket): string {
  const spoken = firstLine(t.text) ?? firstLine(t.transcript);
  if (spoken) return truncate(spoken, TITLE_MAX);
  const page = t.metadata.title.trim() || t.metadata.url;
  return truncate(`Feedback on ${page}`, TITLE_MAX);
}

function contentOf(t: Ticket): Content {
  const imageUrl = t.links.crop ?? t.links.screenshot;
  return {
    image: imageUrl ? { url: imageUrl, alt: t.links.crop ? "Highlighted region" : "Screenshot" } : undefined,
    text: t.text?.trim() || undefined,
    transcript: t.transcript?.trim() || undefined,
    details: detailRows(t),
    consoleErrors: {
      shown: t.metadata.consoleErrors.slice(0, CONSOLE_ERRORS_MAX),
      total: t.metadata.consoleErrors.length,
    },
    links: footerLinks(t),
  };
}

function detailRows(t: Ticket): Row[] {
  const m = t.metadata;
  const selector = t.region?.selector ?? m.selector;
  const rows: Row[] = [
    ["Page", { text: m.title.trim() || m.url, href: m.url }],
    ["Viewport", { text: `${m.viewport.width} × ${m.viewport.height} @${m.devicePixelRatio}x` }],
    ["Browser", { text: m.userAgent }],
    ["Locale", { text: `${m.language}, ${m.timezone}` }],
    ["User", { text: reporter(m.identity) }],
  ];
  const phone = m.identity?.phone?.trim();
  if (phone) rows.push(["Phone", { text: phone }]);
  if (selector) rows.push(["Element", { text: selector, code: true }]);
  // The host app's own details, as it labelled them.
  for (const field of m.fields ?? []) {
    if (field.value.trim()) rows.push([field.label, { text: field.value }]);
  }
  rows.push(["Reported", { text: t.createdAt }]);
  return rows;
}

function footerLinks(t: Ticket): Content["links"] {
  const links = [{ label: "Open in Brainbox", url: t.links.dashboard }];
  if (t.links.replay) links.push({ label: "Session replay", url: t.links.replay });
  if (t.links.screenshot && t.links.crop) links.push({ label: "Full screenshot", url: t.links.screenshot });
  return links;
}

/** "Ana Lima <ana@acme.co>", or the first part known of name, email, phone and
 *  id, the same order the dashboard uses. Blank parts, empty
 *  or only spaces, count as unknown: the schema accepts them, and they would
 *  leave the cell blank. */
function reporter(identity: Identity | undefined): string {
  const name = identity?.name?.trim();
  const email = identity?.email?.trim();
  const phone = identity?.phone?.trim();
  const id = identity?.id?.trim();
  if (name && email) return `${name} <${email}>`;
  return name || email || phone || id || "anonymous";
}

function consoleErrorsLabel({ total }: Content["consoleErrors"]): string {
  return `${total} console error${total === 1 ? "" : "s"}`;
}

// Markdown

function markdownBody(c: Content): string {
  const parts: string[] = [];
  if (c.image) parts.push(`![${c.image.alt}](${c.image.url})`);
  if (c.text) parts.push(c.text);
  if (c.transcript) parts.push(`**Voice note**\n\n${quote(c.transcript)}`);
  parts.push(
    ["| | |", "|---|---|", ...c.details.map(([k, v]) => `| ${cell(k)} | ${markdownCell(v)} |`)].join("\n"),
  );
  if (c.consoleErrors.total > 0) parts.push(markdownConsoleErrors(c.consoleErrors));
  parts.push(c.links.map((l) => `[${l.label}](${l.url})`).join(" · "));
  return `${parts.join("\n\n")}\n`;
}

function markdownCell(v: Cell): string {
  if (v.href) return `[${cell(v.text)}](${v.href})`;
  if (v.code) return `\`${cell(v.text)}\``;
  return cell(v.text);
}

function markdownConsoleErrors(errors: Content["consoleErrors"]): string {
  const shown = errors.shown.map((e) => e.replace(/```/g, "``​`"));
  const more = errors.total - shown.length;
  return [
    "<details>",
    `<summary>${consoleErrorsLabel(errors)}</summary>`,
    "",
    "```",
    ...shown,
    ...(more > 0 ? [`… and ${more} more`] : []),
    "```",
    "",
    "</details>",
  ].join("\n");
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

// HTML

function htmlBody(c: Content): string {
  const parts: string[] = [];
  if (c.image) {
    parts.push(`<p><img src="${escapeHtml(c.image.url)}" alt="${escapeHtml(c.image.alt)}" style="max-width:100%"></p>`);
  }
  if (c.text) parts.push(paragraphs(c.text));
  if (c.transcript) {
    parts.push(`<p><strong>Voice note</strong></p>\n<blockquote>${lines(c.transcript)}</blockquote>`);
  }
  parts.push(htmlTable(c.details));
  if (c.consoleErrors.total > 0) {
    const more = c.consoleErrors.total - c.consoleErrors.shown.length;
    const text = [...c.consoleErrors.shown, ...(more > 0 ? [`… and ${more} more`] : [])].join("\n");
    parts.push(`<p><strong>${consoleErrorsLabel(c.consoleErrors)}</strong></p>\n<pre>${escapeHtml(text)}</pre>`);
  }
  parts.push(`<p>${c.links.map((l) => link(l.url, l.label)).join(" · ")}</p>`);
  return `${parts.join("\n")}\n`;
}

function htmlTable(rows: Row[]): string {
  const body = rows
    .map(([k, v]) => `<tr><th align="left">${escapeHtml(k)}</th><td>${htmlCell(v)}</td></tr>`)
    .join("");
  return `<table>${body}</table>`;
}

function htmlCell(v: Cell): string {
  if (v.href) return link(v.href, v.text);
  if (v.code) return `<code>${escapeHtml(v.text)}</code>`;
  return escapeHtml(v.text);
}

function link(href: string, text: string): string {
  return `<a href="${escapeHtml(safeHref(href))}">${escapeHtml(text)}</a>`;
}

/** Only web links: a host-supplied page URL must not become `javascript:`. */
function safeHref(href: string): string {
  return /^https?:\/\//i.test(href) ? href : "#";
}

function paragraphs(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => `<p>${lines(p.trim())}</p>`)
    .join("\n");
}

function lines(s: string): string {
  return s.split("\n").map(escapeHtml).join("<br>");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
