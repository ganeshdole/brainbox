import { useState } from "react";
import { Check, Copy, Mail, Phone } from "lucide-react";
import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";

import {
  cleanIdentity,
  fieldHref,
  hasReporter,
  highlightLine,
  initials,
  reporterSummary,
} from "../lib/reporter";
import { Eyebrow } from "./Eyebrow";

/**
 * Who filed the report, and everything the host app sent about them. Nothing
 * here is fixed: the heading is the person from `Brainbox.identify()`, the
 * line under it is whichever fields the app marked `highlight`, the buttons
 * appear for the contact details it has, and every detail gets a tile in the
 * app's order with its labels. An app adds a tile just by sending a field.
 * Renders nothing for a report that carries neither a person nor fields.
 */
export function ReporterCard({
  identity: sent,
  fields = [],
}: {
  identity: Identity | undefined;
  fields: ReportField[] | undefined;
}) {
  const identity = cleanIdentity(sent);
  const known = hasReporter(identity);
  if (!known && fields.length === 0) return null;
  const { name, email, phone, id } = identity;
  const title = name || email || phone || "Anonymous";
  const subtitle = highlightLine(fields) || (name ? email : undefined);
  const tiles: ReportField[] = [
    ...(email ? [{ label: "Email", value: email, type: "email" as const }] : []),
    ...(phone ? [{ label: "Phone", value: phone, type: "phone" as const }] : []),
    ...fields,
  ];
  // Two tiles a row; emails and URLs are long, so they get a row of their own,
  // as does a last tile that would otherwise sit alone.
  const wide = (tile: ReportField, i: number): boolean =>
    tile.type === "email" || tile.type === "url" || (i === tiles.length - 1 && fillsHalfRow(tiles, i));

  return (
    <div className="mb-6">
      <Eyebrow className="block px-1 pb-2">Reported by</Eyebrow>
      <div className="overflow-hidden rounded-xl border border-default bg-elevated">
        <div className="bg-gradient-to-b from-[var(--bg-info)] to-transparent p-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#3b5bdb,#7048e8)] text-sm font-semibold text-white"
            >
              {known ? initials(identity) : "?"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-emphasis" title={id}>
                {title}
              </p>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-default" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {email && (
              <ActionLink href={`mailto:${email}`} title={email} icon={<Mail className="h-3.5 w-3.5" />}>
                Email
              </ActionLink>
            )}
            {phone && (
              <ActionLink
                href={fieldHref({ type: "phone", value: phone }) ?? undefined}
                title={phone}
                icon={<Phone className="h-3.5 w-3.5" />}
              >
                Call
              </ActionLink>
            )}
            <CopyAll text={reporterSummary(identity, fields)} />
          </div>
        </div>
        {tiles.length > 0 && (
          <dl className="grid grid-cols-2 gap-px border-t border-default bg-[var(--border-default)]">
            {tiles.map((tile, i) => (
              <div
                key={`${tile.label}-${i}`}
                className={`min-w-0 bg-elevated px-4 py-2.5 ${wide(tile, i) ? "col-span-2" : ""}`}
              >
                <dt className="truncate text-[10px] uppercase tracking-wider text-muted">{tile.label}</dt>
                <dd className="mt-0.5 truncate text-xs">
                  <TileValue field={tile} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

/** True when the tile at `index` would start a row and have no partner, given
 *  that emails and URLs take a whole row each. */
function fillsHalfRow(tiles: ReportField[], index: number): boolean {
  let column = 0;
  for (let i = 0; i < index; i++) {
    const full = tiles[i]?.type === "email" || tiles[i]?.type === "url";
    column = full ? 0 : (column + 1) % 2;
  }
  return column === 0;
}

const ACTION =
  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-default bg-interactive text-xs text-default transition hover:bg-interactive-hover hover:text-emphasis";

function ActionLink({
  href,
  title,
  icon,
  children,
}: {
  href: string | undefined;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a href={href} title={title} className={ACTION}>
      {icon}
      {children}
    </a>
  );
}

function CopyAll({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy every detail"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={ACTION}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TileValue({ field }: { field: ReportField }) {
  const href = fieldHref(field);
  if (!href) {
    return (
      <span className={`text-emphasis ${field.type === "id" ? "font-mono" : ""}`} title={field.value}>
        {field.value}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={field.value}
      {...(field.type === "url" && { target: "_blank", rel: "noreferrer" })}
      className="text-link hover:underline"
    >
      {field.value}
    </a>
  );
}
