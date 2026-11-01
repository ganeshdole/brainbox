import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GITHUB_URL } from "@/lib/links"
import { dashboardUrl } from "@/lib/signup"
import { openWidget } from "@/lib/widget-loader"
import { CONTAINER } from "./section-head"

const columns = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "What's in a report", href: "/#report" },
      { label: "Integrations", href: "/#integrations" },
      { label: "Feature requests", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Install", href: "/#install" },
      { label: "Widget on npm", href: "https://www.npmjs.com/package/@ganeshdole/brainbox-widget" },
      { label: "React bindings", href: "https://www.npmjs.com/package/@ganeshdole/brainbox-react" },
      { label: "Self-hosting guide", href: `${GITHUB_URL}/blob/main/docs/self-hosting.md` },
      { label: "Source on GitHub", href: GITHUB_URL },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Install guides", href: "/install" },
      { label: "Integrations", href: "/integrations" },
      { label: "Compare", href: "/alternatives" },
      { label: "Templates", href: "/templates" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Get started", href: "/#pricing" },
      { label: "Sign in", href: dashboardUrl() },
    ],
  },
]

const external = (href: string) => href.startsWith("https://") && !href.startsWith(dashboardUrl())

export function Footer() {
  return (
    <footer className="overflow-hidden border-t border-default">
      <div className={CONTAINER}>
        {/* The page ends by asking for what the product collects: feedback, through the real widget. */}
        <div className="grid gap-10 py-20 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:py-24">
          <div>
            <h2 className="max-w-[720px] text-[32px] leading-[1.08] font-[560] tracking-[-0.03em] text-pretty text-emphasis md:text-[48px]">
              <span className="text-gray-9">Found something broken on this page?</span> Tell us the way
              your users will.
            </h2>
            <p className="mt-5 max-w-[520px] text-[17px] leading-[1.55] text-gray-10">
              The widget in the corner is the real one. Point at what&rsquo;s wrong, say what
              happened, and it lands in our inbox.
            </p>
            <Button asChild className="mt-8 rounded-lg px-[18px]">
              <a href="/#pricing">Get started</a>
            </Button>
          </div>

          <button
            type="button"
            onClick={openWidget}
            className="flex w-fit cursor-pointer items-center gap-3 rounded-xl border border-default py-3.5 pr-5 pl-3.5 text-left transition-colors outline-none hover:border-interactive hover:bg-interactive focus-visible:ring-[3px] focus-visible:ring-focus"
          >
            <span className="grid size-10 place-items-center rounded-full bg-brand text-on-brand">
              <MessageSquarePlus className="size-[18px]" aria-hidden />
            </span>
            <span>
              <span className="block text-[14px] font-medium text-emphasis">Send feedback</span>
              <span className="block text-[13px] text-gray-10">Opens the real widget</span>
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-12 border-t border-default py-14 md:flex-row md:justify-between">
          <div>
            <a href="/#top" className="flex w-fit items-center gap-2">
              <img
                src="/assets/brainbox-logo.png"
                alt=""
                className="size-5 object-contain"
                width={20}
                height={20}
              />
              <span className="text-[15px] font-[560] tracking-[-0.01em] text-emphasis">Brainbox</span>
            </a>
            <p className="mt-3.5 max-w-[260px] text-[14px] leading-[1.55] text-gray-10">
              Bug reports from your users that you can start on.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title} className="min-w-[140px]">
                <h3 className="text-[13px] font-medium text-emphasis">{col.title}</h3>
                <ul className="mt-3.5 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        {...(external(l.href) && { target: "_blank", rel: "noreferrer" })}
                        className="text-[14px] text-gray-10 transition-colors hover:text-emphasis"
                      >
                        {l.label}
                        {external(l.href) && (
                          <span className="ml-1 text-[11px] text-gray-9" aria-hidden>
                            &#8599;
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-default py-6 text-[13px] text-gray-9 sm:flex-row sm:justify-between">
          <span>&copy; 2026 Brainbox</span>
          <a
            href={`${GITHUB_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-emphasis"
          >
            Source available under the O&rsquo;Saasy license
          </a>
        </div>

        {/* The name, cropped by the page's bottom edge. */}
        <div
          aria-hidden
          className="-mb-px h-[0.6em] overflow-hidden text-[clamp(88px,23vw,300px)] leading-none font-[600] tracking-[-0.055em] whitespace-nowrap text-gray-2 select-none"
        >
          <span className="-ml-[0.04em] block">Brainbox</span>
        </div>
      </div>
    </footer>
  )
}
