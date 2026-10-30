import { GITHUB_URL } from "@/lib/links"
import { Section, SectionHead } from "./section-head"

// The tag the dashboard hands out (dashboard/src/lib/snippet.ts), with a placeholder key.
const SNIPPET = `<script
  src="https://app.brainbox.ganeshdole.com/widget.js"
  data-project="pk_your_project_key"
  data-endpoint="https://app.brainbox.ganeshdole.com/ingest"
></script>`

const facts = [
  {
    title: "Your own button, if you want one",
    body: (
      <>
        Any element with <code className="font-mono text-[13px] text-default">data-brainbox</code>{" "}
        opens it, or call <code className="font-mono text-[13px] text-default">Brainbox.open()</code>.
        React apps can use the component instead.
      </>
    ),
  },
  {
    title: "Private by default",
    body: (
      <>
        Typed values are always masked in recordings. Add{" "}
        <code className="font-mono text-[13px] text-default">rr-block</code> or{" "}
        <code className="font-mono text-[13px] text-default">rr-mask</code> to anything else you
        want kept out.
      </>
    ),
  },
  {
    title: "Light until it's used",
    body: "The code that takes screenshots and recordings loads only when someone starts a report.",
  },
  {
    title: "Yours to host",
    body: (
      <>
        The source is{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-emphasis underline-offset-4 hover:underline"
        >
          on GitHub
        </a>
        . Run the backend on your own Postgres or Convex, with S3 or R2 for files.
      </>
    ),
  },
]

export function Install() {
  return (
    <Section id="install">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <SectionHead
          title="One script tag."
          desc="Paste it before </body> and the widget is live. Your project key is in the dashboard."
        />
        <pre className="min-w-0 self-start overflow-x-auto rounded-xl border border-default bg-subtle p-5 font-mono text-[13px] leading-[1.7] text-default max-sm:break-all max-sm:whitespace-pre-wrap">
          <code>{SNIPPET}</code>
        </pre>
      </div>

      <dl className="mt-12 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.title} className="border-t border-default py-6">
            <dt className="text-[15px] font-[560] text-emphasis">{f.title}</dt>
            <dd className="mt-1.5 text-[15px] leading-[1.55] text-gray-10">{f.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
