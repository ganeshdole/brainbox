import { Fragment } from "react"
import { Button } from "@/components/ui/button"
import type { Article, Block, Hub } from "@/content/types"
import { CONTAINER } from "./section-head"

const LINK = "text-emphasis underline underline-offset-4 decoration-gray-8 hover:decoration-current"
const INLINE = /(`[^`]+`|\[[^\]]+\]\([^)\s]+\))/

/** Text with `inline code` and [links](/path). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return (
            <code key={i} className="rounded bg-interactive-hover px-1.5 py-0.5 font-mono text-[0.88em] text-emphasis">
              {part.slice(1, -1)}
            </code>
          )
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
        if (link) {
          const [, label, href = ""] = link
          const external = href.startsWith("http")
          return (
            <a key={i} href={href} className={LINK} {...(external && { target: "_blank", rel: "noreferrer" })}>
              {label}
            </a>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if ("p" in block) {
    return (
      <p className="mt-4 text-[16px] leading-[1.65] text-pretty text-default">
        <RichText text={block.p} />
      </p>
    )
  }
  if ("code" in block) {
    return (
      <figure className="mt-5 min-w-0 overflow-hidden rounded-xl border border-default bg-subtle">
        {block.file && (
          <figcaption className="border-b border-default px-5 py-2.5 font-mono text-[12px] text-gray-10">
            {block.file}
          </figcaption>
        )}
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.7] text-default">
          <code>{block.code}</code>
        </pre>
      </figure>
    )
  }
  if ("list" in block) {
    return (
      <ul className="mt-4 list-disc space-y-2 pl-5 text-[16px] leading-[1.6] text-default marker:text-gray-9">
        {block.list.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-default">
      <table className="w-full border-collapse text-left text-[14px] leading-[1.5]">
        <thead className="bg-subtle">
          <tr>
            {block.table.head.map((h, i) => (
              <th key={i} scope="col" className="border-b border-default px-4 py-2.5 font-[560] text-emphasis">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row) => (
            <tr key={row.join("|")} className="border-b border-default last:border-0">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-4 py-2.5 align-top font-[560] text-emphasis">
                    <RichText text={cell} />
                  </th>
                ) : (
                  <td key={i} className="px-4 py-2.5 align-top text-default">
                    <RichText text={cell} />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Eyebrow({ parent, name }: { parent: { label: string; href: string }; name?: string }) {
  return (
    <p className="font-mono text-[12px] tracking-[0.12em] text-gray-10 uppercase">
      <a href={parent.href} className="hover:text-emphasis">
        {parent.label}
      </a>
      {name && <> / {name}</>}
    </p>
  )
}

function TryIt() {
  return (
    <section className="mt-14 rounded-xl border border-default bg-subtle p-7 md:p-8">
      <h2 className="text-[20px] font-[560] tracking-[-0.01em] text-emphasis">Try it before you install it</h2>
      <p className="mt-2 text-[15px] leading-[1.6] text-gray-10">
        The button in the corner of this page is the real widget. Report something on this page and it
        lands in our inbox, the way your users&rsquo; reports will land in yours.
      </p>
      <Button asChild className="mt-6 rounded-lg px-[18px]">
        <a href="/#pricing">Get started</a>
      </Button>
    </section>
  )
}

export function ArticlePage({ article }: { article: Article }) {
  return (
    <article className={`${CONTAINER} pt-16 pb-20 md:pt-24 md:pb-28`}>
      <div className="max-w-[760px]">
        <Eyebrow parent={article.parent} name={article.name} />
        <h1 className="mt-4 text-[36px] leading-[1.08] font-[560] tracking-[-0.03em] text-balance text-emphasis md:text-[52px]">
          {article.heading}
        </h1>
        {article.intro.map((p) => (
          <p key={p} className="mt-5 text-[17px] leading-[1.6] text-pretty text-gray-10">
            <RichText text={p} />
          </p>
        ))}
        {article.checked && (
          <p className="mt-5 text-[13px] text-gray-10">
            Facts about other products checked on{" "}
            <time dateTime={article.checked.date}>{article.checked.date}</time>, from their own sites
            (sources at the end). Prices change; theirs may have since.
          </p>
        )}

        {article.sections.map((section) => (
          <section key={section.title} className="mt-14 border-t border-default pt-10">
            <h2 className="text-[24px] leading-[1.2] font-[560] tracking-[-0.02em] text-emphasis md:text-[28px]">
              {section.title}
            </h2>
            {section.blocks.map((block, i) => (
              <BlockView key={i} block={block} />
            ))}
          </section>
        ))}

        <TryIt />

        {article.checked && (
          <section className="mt-12">
            <h2 className="text-[15px] font-[560] text-emphasis">Sources</h2>
            <ul className="mt-3 space-y-2 text-[14px]">
              {article.checked.sources.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="text-gray-10 underline-offset-4 hover:text-emphasis hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {article.related && article.related.length > 0 && (
          <nav aria-label="Related" className="mt-12">
            <h2 className="text-[15px] font-[560] text-emphasis">Related</h2>
            <ul className="mt-3 grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
              {article.related.map((r) => (
                <li key={r.href}>
                  <a
                    href={r.href}
                    {...(r.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                    className="text-gray-10 underline-offset-4 hover:text-emphasis hover:underline"
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </article>
  )
}

export function HubPage({ hub }: { hub: Hub }) {
  return (
    <section className={`${CONTAINER} pt-16 pb-20 md:pt-24 md:pb-28`}>
      <div className="max-w-[760px]">
        <Eyebrow parent={{ label: "Brainbox", href: "/" }} name={hub.name} />
        <h1 className="mt-4 text-[36px] leading-[1.08] font-[560] tracking-[-0.03em] text-balance text-emphasis md:text-[52px]">
          {hub.heading}
        </h1>
        {hub.intro.map((p) => (
          <p key={p} className="mt-5 text-[17px] leading-[1.6] text-pretty text-gray-10">
            <RichText text={p} />
          </p>
        ))}
      </div>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hub.items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="block h-full rounded-xl border border-default p-6 transition-colors hover:border-interactive hover:bg-subtle"
            >
              <span className="block text-[17px] font-[560] text-emphasis">{item.name}</span>
              <span className="mt-2 block text-[14px] leading-[1.55] text-gray-10">{item.summary}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
