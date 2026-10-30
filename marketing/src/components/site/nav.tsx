import { Button } from "@/components/ui/button"
import { dashboardUrl } from "@/lib/signup"
import { CONTAINER } from "./section-head"

const links = [
  { href: "#how", label: "How it works" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]

export function Nav() {
  return (
    <header className="glass sticky top-0 z-50 border-b border-default bg-[color-mix(in_srgb,var(--bg-background)_80%,transparent)]">
      <div className={`${CONTAINER} grid h-16 grid-cols-[1fr_auto] items-center md:grid-cols-[1fr_auto_1fr]`}>
        <a href="#top" className="flex items-center gap-2 justify-self-start">
          <img
            src="/assets/brainbox-logo.png"
            alt=""
            className="size-5 object-contain"
            width={20}
            height={20}
          />
          <span className="text-[15px] font-[560] tracking-[-0.01em] text-emphasis">Brainbox</span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-gray-10 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-emphasis">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-5 justify-self-end">
          <a href={dashboardUrl()} className="text-sm text-gray-10 transition-colors hover:text-emphasis">
            Sign in
          </a>
          <Button asChild size="sm">
            <a href="#pricing">Get started</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
