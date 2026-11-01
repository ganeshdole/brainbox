import { Plus } from "lucide-react"
import { OVERAGE_CENTS_PER_TICKET, formatUsd } from "@/lib/pricing"
import { Section, SectionHead } from "./section-head"

const questions = [
  {
    q: "Do my users need an account or a browser extension?",
    a: "No. The widget runs inside your app. They click it, mark the page, say what happened and send.",
  },
  {
    q: "Will it slow my app down?",
    a: "The page loads one script for the launcher. The code that takes screenshots and recordings is fetched only when someone starts a report.",
  },
  {
    q: "What about passwords and personal data?",
    a: "Typed values are always masked in recordings, so passwords, emails and card numbers never leave the browser as plain text. Add rr-block or rr-mask to any element you want kept out, and you can apply the same rules to screenshots.",
  },
  {
    q: "Who needs a seat?",
    a: "Nobody pays per seat. Invite your whole team as owners, admins or members, on any plan.",
  },
  {
    q: "What counts as a ticket?",
    a: `Each bug report or feature request a user sends. If you go over your plan's allowance it's ${formatUsd(OVERAGE_CENTS_PER_TICKET)} per extra ticket, and nothing a user sends is ever dropped.`,
  },
  {
    q: "Where do reports go?",
    a: "Always to your Brainbox inbox. Connect GitHub or Azure DevOps and each one is also filed there as an issue or work item, automatically.",
  },
  {
    q: "Does it work in mobile apps?",
    a: "Brainbox is for web apps. There is no iOS or Android SDK.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes. The source is on GitHub under the O'Saasy license: run it for your own products on your own Postgres or Convex, with S3 or R2 for files. The one thing it rules out is selling Brainbox itself as a hosted service.",
  },
  {
    q: "What if it isn't right for us?",
    a: "Ask for a refund within 60 days and you get your money back. You can cancel any time.",
  },
]

export function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <SectionHead title="Questions" />
        <div className="border-b border-default">
          {questions.map(({ q, a }) => (
            <details key={q} className="group border-t border-default">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-[500] text-emphasis outline-none focus-visible:ring-[3px] focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
                {q}
                <Plus
                  className="size-4 shrink-0 text-gray-10 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                  aria-hidden
                />
              </summary>
              <p className="-mt-1 max-w-[600px] pb-6 text-[15px] leading-[1.6] text-gray-10">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}
