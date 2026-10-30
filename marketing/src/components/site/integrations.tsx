import { Section, SectionHead } from "./section-head"
import { Shot } from "./shot"

const destinations = [
  {
    name: "GitHub Issues",
    body: "Installed as the Brainbox GitHub App on your org or account. Pick the repo and the labels, and pause it whenever you like.",
  },
  {
    name: "Azure DevOps",
    body: "Pick the project, the board and the iteration, and a work item type for bugs and another for feature requests.",
  },
]

// The issue renderTicket() in @ganeshdole/brainbox-integrations files for the
// report in the hero, shown the way GitHub renders its Markdown. The links point
// at the customer's own Brainbox, so here they are only styled as links.
const ISSUE = {
  title: "I tap Pay and nothing happens. Tried twice, the button doesn't even sho…",
  text: "I tap Pay and nothing happens. Tried twice, the button doesn't even show a spinner.",
  rows: [
    ["Page", "Checkout · Acme Store", "link"],
    ["Viewport", "1440 × 900 @2x"],
    [
      "Browser",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    ],
    ["Locale", "en-GB, Asia/Calcutta"],
    ["User", "anonymous"],
    ["Element", "button#pay", "code"],
    ["Reported", "2026-10-30T19:54:56.392884+00:00"],
  ],
  consoleError: `TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')
    at HTMLButtonElement.<anonymous> (http://shop.acme.example/checkout:50:84)`,
  links: ["Open in Brainbox", "Full screenshot"],
}

function IssuePreview() {
  return (
    <figure className="min-w-0 self-start overflow-hidden rounded-xl border border-default bg-subtle">
      <figcaption className="border-b border-default px-5 py-3 font-mono text-[11px] tracking-[0.12em] text-gray-10 uppercase">
        The GitHub issue it files
      </figcaption>
      <div className="p-5 md:p-6">
        <h3 className="text-[19px] leading-[1.35] font-[560] tracking-[-0.01em] text-emphasis">{ISSUE.title}</h3>

        <div className="mt-5 border-t border-default pt-5 text-[14px] leading-[1.6] text-default">
          <Shot
            name="issue-crop"
            sizes="384px"
            width={384}
            height={72}
            alt="Highlighted region: the Pay $128.00 button, boxed in red."
            className="max-w-[384px] overflow-hidden rounded-md"
          />
          <p className="mt-4">{ISSUE.text}</p>

          <table className="mt-4 w-full border-collapse text-[13px]">
            <tbody>
              {ISSUE.rows.map(([label, value, kind]) => (
                <tr key={label} className="border border-default">
                  <th scope="row" className="w-24 border-r border-default px-3 py-1.5 text-left align-top font-[560] text-emphasis">
                    {label}
                  </th>
                  <td className="px-3 py-1.5 break-words text-default">
                    {kind === "link" ? (
                      <span className="text-link">{value}</span>
                    ) : kind === "code" ? (
                      <code className="rounded bg-interactive-hover px-1.5 py-0.5 font-mono text-[12px]">{value}</code>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details open className="mt-4">
            <summary className="cursor-pointer text-emphasis">1 console error</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-interactive p-3 font-mono text-[12px] leading-[1.6] text-default max-sm:break-all max-sm:whitespace-pre-wrap">
              <code>{ISSUE.consoleError}</code>
            </pre>
          </details>

          <p className="mt-4">
            {ISSUE.links.map((label, i) => (
              <span key={label}>
                {i > 0 && <span className="text-gray-10"> &middot; </span>}
                <span className="text-link">{label}</span>
              </span>
            ))}
          </p>
        </div>
      </div>
    </figure>
  )
}

export function Integrations() {
  return (
    <Section id="integrations">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <SectionHead
            title="Filed where you already work."
            desc="Connect once for the whole team. Every new report is filed on its own, with the screenshot, their words and the console errors in the body."
          />
          <dl className="mt-10">
            {destinations.map((d) => (
              <div key={d.name} className="border-t border-default py-6">
                <dt className="text-[15px] font-[560] text-emphasis">{d.name}</dt>
                <dd className="mt-1.5 text-[15px] leading-[1.55] text-gray-10">{d.body}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-default pt-6 text-[15px] leading-[1.55] text-gray-10">
            Every report also lands in the Brainbox inbox, where your team sets status and
            priority. A delivery that fails shows why, and you can send it again.
          </p>
        </div>

        <IssuePreview />
      </div>
    </Section>
  )
}
