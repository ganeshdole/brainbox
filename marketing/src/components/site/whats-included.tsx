import { Section, SectionHead } from "./section-head"

const items = [
  {
    title: "Screenshot and marks",
    body: "The page as they saw it, with their marks on it and the area they pointed at cropped out and enlarged.",
  },
  {
    title: "Their words",
    body: "A voice note or a typed description. Nobody has to learn how to write a bug report.",
  },
  {
    title: "Console errors",
    body: "Errors and unhandled promise rejections from the page, with where each one was thrown.",
  },
  {
    title: "Screen recording",
    body: "When a screenshot isn't enough, they record what they're doing, with narration if they like. Typed values are masked.",
  },
  {
    title: "Environment",
    body: "URL, page title, browser, viewport, language, timezone and the element they pointed at.",
  },
  {
    title: "Who sent it",
    body: "Call Brainbox.identify() with your user's id or email, and it's on every report they send.",
  },
]

export function WhatsIncluded() {
  return (
    <Section id="report">
      <SectionHead
        title="Everything you'd have asked them for."
        desc="Each report arrives with the context that usually takes three emails to get, so you can start on the fix instead of the follow-up."
      />

      <dl className="mt-12 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="border-t border-default py-6">
            <dt className="text-[15px] font-[560] text-emphasis">{item.title}</dt>
            <dd className="mt-1.5 text-[15px] leading-[1.55] text-gray-10">{item.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
