import { GITHUB_URL } from "@/lib/links"

// Links without an href are placeholders until the page exists.
const cols: { h: string; links: { label: string; href?: string }[] }[] = [
  {
    h: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Integrations", href: "#integrations" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog" },
    ],
  },
  { h: "Company", links: [{ label: "About" }, { label: "Roadmap" }, { label: "Contact" }] },
  {
    h: "Connect",
    links: [{ label: "Twitter / X" }, { label: "GitHub", href: GITHUB_URL }, { label: "Email founder" }],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-default">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <a href="#top" className="flex items-center gap-2">
              <img
                src="/assets/brainbox-logo.png"
                alt="Brainbox"
                className="size-7 object-contain"
                width={28}
                height={28}
              />
              <span className="text-[15px] font-semibold tracking-tight text-emphasis">
                Brainbox
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-default">
              The voice-powered feedback widget for SaaS. Users talk, Brainbox writes
              developer-ready tickets.
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.h}>
              <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-default">
                {c.h}
              </h3>
              <ul className="mt-4 space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href ?? "#"}
                      {...(l.href?.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                      className="text-sm text-default transition-colors hover:text-emphasis"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-default pt-6 font-mono text-xs text-gray-11/70 sm:flex-row">
          <span>© 2026 Brainbox. Built for builders.</span>
          <span>Privacy · Terms</span>
        </div>
      </div>
    </footer>
  )
}
