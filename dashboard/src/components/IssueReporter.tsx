import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";

import { fieldHref, hasReporter, initials } from "../lib/reporter";
import { Eyebrow } from "./Eyebrow";

/** Who filed the report, from `Brainbox.identify()`. Renders nothing for an
 *  anonymous report. */
export function ReporterCard({ identity }: { identity: Identity | undefined }) {
  if (!hasReporter(identity)) return null;
  const { name, email, phone, id } = identity;
  const title = name || email || phone || id;
  return (
    <div className="mb-6">
      <Eyebrow className="block px-1 pb-2">Reported by</Eyebrow>
      <div className="rounded-xl border border-default bg-elevated p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-interactive text-xs font-semibold text-emphasis"
          >
            {initials(identity)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-emphasis">{title}</p>
            {id && title !== id && <p className="truncate font-mono text-[11px] text-muted">{id}</p>}
          </div>
        </div>
        {(email || phone) && (
          <div className="mt-3 grid gap-1 text-xs">
            {email && email !== title && <FieldValue field={{ label: "Email", value: email, type: "email" }} />}
            {phone && phone !== title && <FieldValue field={{ label: "Phone", value: phone, type: "phone" }} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** The host app's own details, in its order and with its labels. Brainbox
 *  knows none of them in advance. */
export function AppFields({ fields }: { fields: ReportField[] | undefined }) {
  if (!fields?.length) return null;
  return (
    <div className="mb-6">
      <Eyebrow className="block px-1 pb-1">From the app</Eyebrow>
      {fields.map((field, i) => (
        <div
          key={`${field.label}-${i}`}
          className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 text-xs"
        >
          <span className="shrink-0 text-muted">{field.label}</span>
          <FieldValue field={field} />
        </div>
      ))}
    </div>
  );
}

function FieldValue({ field }: { field: ReportField }) {
  const href = fieldHref(field);
  const mono = field.type === "id" ? "font-mono" : "";
  if (!href) {
    return (
      <span className={`truncate text-default ${mono}`} title={field.value}>
        {field.value}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={field.value}
      {...(field.type === "url" && { target: "_blank", rel: "noreferrer" })}
      className="truncate text-link hover:underline"
    >
      {field.value}
    </a>
  );
}
