import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";

import { fieldHref, hasReporter, initials } from "../lib/reporter";
import { Eyebrow } from "./Eyebrow";

/**
 * Who filed the report, and everything the host app sent about them. The
 * heading is the person from `Brainbox.identify()`; below it are their email
 * and phone, then the app's own fields (`Brainbox.setFields()`) in its order
 * and with its labels. Brainbox knows none of those fields in advance, so an
 * app adds a row here just by sending one. Renders nothing for a report that
 * carries neither.
 */
export function ReporterCard({
  identity,
  fields = [],
}: {
  identity: Identity | undefined;
  fields: ReportField[] | undefined;
}) {
  const known = hasReporter(identity);
  if (!known && fields.length === 0) return null;
  const { name, email, phone, id } = identity ?? {};
  const title = name || email || phone || id || "Anonymous";
  const rows: ReportField[] = [
    ...(email && email !== title ? [{ label: "Email", value: email, type: "email" as const }] : []),
    ...(phone && phone !== title ? [{ label: "Phone", value: phone, type: "phone" as const }] : []),
    ...fields,
  ];

  return (
    <div className="mb-6">
      <Eyebrow className="block px-1 pb-2">Reported by</Eyebrow>
      <div className="rounded-xl border border-default bg-elevated p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-interactive text-xs font-semibold text-emphasis"
          >
            {known ? initials(identity) : "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-emphasis">{title}</p>
            {id && title !== id && <p className="truncate font-mono text-[11px] text-muted">{id}</p>}
          </div>
        </div>
        {rows.length > 0 && (
          <dl className="mt-3 border-t border-subtle pt-1">
            {rows.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 text-xs last:border-b-0"
              >
                <dt className="shrink-0 text-muted">{row.label}</dt>
                <dd className="min-w-0 truncate text-right">
                  <FieldValue field={row} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function FieldValue({ field }: { field: ReportField }) {
  const href = fieldHref(field);
  if (!href) {
    return (
      <span className={`text-default ${field.type === "id" ? "font-mono" : ""}`} title={field.value}>
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
