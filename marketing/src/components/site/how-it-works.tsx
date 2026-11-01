import { Section, SectionHead } from "./section-head"
import { Shot } from "./shot"

const steps = [
  {
    title: "Open the widget",
    body: "From the button in the corner, or from your own. They can screenshot the page, record it, or suggest a feature.",
  },
  {
    title: "Point at what broke",
    body: "A box, an arrow, a pen line or a note, drawn on a frozen copy of the page.",
  },
  {
    title: "Say what happened",
    body: "Talk it through, or type it if they would rather. Then send.",
  },
]

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHead
        title="Your users point at it and say what happened."
        desc="No account, no browser extension. The widget runs inside your app, in its own Shadow DOM, so your styles and ours never meet."
      />

      <div className="mt-12 overflow-hidden rounded-xl border border-default">
        <Shot
          name="widget-mark"
          className="hidden md:block"
          sizes="(min-width: 1200px) 1120px, calc(100vw - 80px)"
          width={1120}
          height={709}
          alt="A checkout page with the Brainbox widget open. The page is frozen, a red box is drawn around the Pay $128.00 button, and a toolbar at the bottom offers select, box, arrow, pen, text, colour, undo and Next."
        />
        <Shot
          name="widget-mark-phone"
          className="md:hidden"
          sizes="calc(100vw - 40px)"
          width={360}
          height={182}
          alt="A red box drawn around a checkout page's Pay button, with the Brainbox mark-up toolbar below it."
        />
      </div>

      <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="font-mono text-[13px] text-gray-9">{i + 1}</span>
            <h3 className="mt-2 text-[17px] font-[560] tracking-[-0.01em] text-emphasis">{s.title}</h3>
            <p className="mt-1.5 text-[15px] leading-[1.55] text-gray-10">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
