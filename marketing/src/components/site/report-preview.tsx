import { SectionHead } from "./section-head"

/**
 * The dashboard, as it looks when a voice note has landed.
 *
 * Built in markup rather than shipped as a screenshot: it stays sharp on every
 * display, restyles with the site, and - the real reason - a screenshot of the
 * dashboard goes quietly stale the first time the dashboard changes, and nobody
 * notices for months.
 *
 * Mirrors dashboard/src/components/IssueDetailPane.tsx: same panel order, same
 * eyebrow labels, same Environment rows. The content is an example, but the
 * shape is the product.
 */

const REPORT = {
  note: "The Pay now button does nothing on the last checkout step.",
  filedAt: "14:02",
  page: "app.acme.dev/checkout",
  reporter: "maya@acme.dev",
  region: "412×180 · (612, 344)",
  transcript:
    "I put my card in, hit Pay now and nothing happens - no spinner, no error, it just sits there. I tried twice, then on my phone, same thing.",
  environment: [
    ["URL", "app.acme.dev/checkout"],
    ["Viewport", "1440×900 @2x"],
    ["Language", "en-GB"],
    ["Timezone", "Europe/London"],
    ["Selector", "button.checkout__pay"],
    ["User agent", "Safari 18.4 · macOS"],
  ],
  consoleErrors: [
    "TypeError: Cannot read properties of undefined (reading 'token')",
    "POST /api/pay 500 (Internal Server Error)",
  ],
}

function Eyebrow({ children, tone }: { children: string; tone?: "error" }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
        tone === "error" ? "text-error" : "text-default"
      }`}
    >
      {children}
    </span>
  )
}

export function ReportPreview() {
  return (
    <section id="report" className="mx-auto max-w-6xl px-6 py-24 md:py-32">
      <SectionHead
        label="The report"
        title="What you get is a ticket, not a complaint."
        desc="Every tap arrives with the screen, the words, the environment and the errors already attached. Nothing left to ask the user."
      />

      <div className="border-sheen overflow-hidden rounded-3xl bg-white/[0.02]">
        <div className="flex items-center gap-2 border-b border-default px-4 py-3">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </span>
          <span className="mx-auto truncate font-mono text-[11px] text-default">
            app.brainbox.ganeshdole.com/reports
          </span>
        </div>

        <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)] lg:p-8">
          <div className="min-w-0">
            <h3 className="text-base font-medium tracking-tight text-emphasis">
              {REPORT.note}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-gray-11/70">
              <span>Today {REPORT.filedAt}</span>
              <span>{REPORT.page}</span>
              <span>{REPORT.reporter}</span>
            </div>

            <div className="mt-6 flex items-baseline justify-between px-1 pb-2">
              <Eyebrow>Highlighted region</Eyebrow>
              <span className="font-mono text-[11px] text-gray-11/70">{REPORT.region}</span>
            </div>
            <CapturedScreen />
          </div>

          <aside className="min-w-0">
            <div className="px-1 pb-2">
              <Eyebrow>Voice transcript</Eyebrow>
            </div>
            <p className="rounded-xl border border-default bg-white/[0.03] p-4 text-sm leading-relaxed text-default">
              {REPORT.transcript}
            </p>

            <div className="mt-6 block px-1 pb-1">
              <Eyebrow>Environment</Eyebrow>
            </div>
            <dl>
              {REPORT.environment.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 text-xs"
                >
                  <dt className="shrink-0 text-gray-11/70">{label}</dt>
                  <dd className="truncate font-mono text-default">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 px-1 pb-2">
              <Eyebrow tone="error">{`Console · ${REPORT.consoleErrors.length}`}</Eyebrow>
            </div>
            <ul className="space-y-2 rounded-lg border border-error-subtle bg-error p-3">
              {REPORT.consoleErrors.map((err) => (
                <li key={err} className="font-mono text-xs leading-relaxed break-words text-error">
                  {err}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </section>
  )
}

/**
 * The captured screenshot: a light host app under a dark dashboard, which is
 * what a real capture looks like sitting in the report - and the contrast is
 * what makes it read as a screenshot rather than more of our own chrome.
 */
function CapturedScreen() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-default bg-[#f4f4f5] p-5 sm:p-7">
      <div className="mx-auto max-w-sm rounded-xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
        <div className="text-[13px] font-semibold text-[#18181b]">Payment</div>
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between rounded-lg border border-[#e4e4e7] px-3 py-2">
            <span className="font-mono text-[11px] text-[#71717a]">•••• •••• •••• 4242</span>
            <span className="h-3 w-6 rounded-sm bg-[#e4e4e7]" />
          </div>
          <div className="flex gap-2.5">
            <div className="h-8 flex-1 rounded-lg border border-[#e4e4e7]" />
            <div className="h-8 w-20 rounded-lg border border-[#e4e4e7]" />
          </div>
        </div>

        {/* The highlight the end-user drew, in the widget's own accent. */}
        <div className="relative mt-4">
          <div className="rounded-lg bg-[#18181b] py-2.5 text-center text-[13px] font-medium text-white">
            Pay now
          </div>
          <div className="pointer-events-none absolute -inset-1.5 rounded-xl ring-2 ring-[var(--green-9)]" />
        </div>

        <div className="mt-4 h-2 w-2/3 rounded-full bg-[#f4f4f5]" />
      </div>
    </div>
  )
}
