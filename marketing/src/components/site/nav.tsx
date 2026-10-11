import { Button } from "@/components/ui/button"
import { GITHUB_URL } from "@/lib/links"
import { dashboardUrl } from "@/lib/signup"

const links = [
  { href: "#how", label: "How it works" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
]

export function Nav() {
  return (
    <header className="glass sticky top-0 z-50 border-b border-default bg-black/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <img
            src="/assets/brainbox-logo.png"
            alt="Brainbox"
            className="size-7 object-contain"
            width={28}
            height={28}
          />
          <span className="text-[15px] font-semibold tracking-tight text-emphasis">Brainbox</span>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-default md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-emphasis">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Brainbox on GitHub"
            className="text-default transition-colors hover:text-emphasis"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
          <Button asChild size="sm">
            <a href={dashboardUrl()}>Sign in</a>
          </Button>
        </div>
      </div>
    </header>
  )
}
