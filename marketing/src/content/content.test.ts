import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { renderTicket, type Ticket } from "@ganeshdole/brainbox-integrations"
import { describe, expect, it } from "vitest"
import { CHECKED } from "./alternatives"
import { GITHUB_SAMPLE } from "./destinations"
import { ARTICLES, HUBS } from "./index"
import { WINDOW_TYPES } from "./snippets"
import type { Block } from "./types"

// The pages promise APIs and quote output; these hold them to the code.
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const ENTRIES: Record<string, string> = {
  "@ganeshdole/brainbox-widget": read("../../../widget/src/index.ts"),
  "@ganeshdole/brainbox-react": read("../../../packages/react/src/index.ts"),
  "@ganeshdole/brainbox-core": read("../../../packages/core/src/index.ts"),
  "@ganeshdole/brainbox-integrations": read("../../../packages/integrations/src/index.ts"),
}
const WIDGET_README = read("../../../widget/README.md")
const EMBED = read("../../../widget/src/embed.ts")
// Attributes the frameworks own, shown because they are in their default templates.
const FRAMEWORK_ATTRIBUTES = new Set(["data-sveltekit-preload-data"])

function exportedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const [, list = ""] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of list.split(",")) {
      const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  for (const [, name = ""] of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g)) names.add(name)
  return names
}

const codeBlocks = ARTICLES.flatMap((a) =>
  a.sections.flatMap((s) =>
    s.blocks.flatMap((b: Block) => ("code" in b ? [{ page: a.path, code: b.code, lang: b.lang }] : [])),
  ),
)
const texts = ARTICLES.flatMap((a) => [
  ...a.intro,
  ...a.sections.flatMap((s) =>
    s.blocks.flatMap((b: Block) =>
      "p" in b ? [b.p] : "list" in b ? b.list : "table" in b ? b.table.rows.flat() : [],
    ),
  ),
])

describe("articles", () => {
  it("have unique paths under their hub", () => {
    const paths = ARTICLES.map((a) => a.path)
    expect(new Set(paths).size).toBe(paths.length)
    const hubs = new Set(HUBS.map((h) => h.path))
    for (const a of ARTICLES) {
      expect(a.path, a.path).toMatch(/^\/[a-z]+\/[a-z0-9-]+$/)
      expect(hubs.has(a.parent.href), a.path).toBe(true)
      expect(a.path.startsWith(`${a.parent.href}/`), a.path).toBe(true)
    }
  })

  it.each([...ARTICLES, ...HUBS].map((p) => [p.path, p] as const))(
    "%s has a title and description that fit a search result",
    (_, page) => {
      expect(`${page.title} · Brainbox`.length).toBeLessThanOrEqual(60)
      expect(page.description.length).toBeGreaterThanOrEqual(70)
      expect(page.description.length).toBeLessThanOrEqual(160)
    },
  )

  it("are listed on their hub", () => {
    for (const a of ARTICLES) {
      const hub = HUBS.find((h) => h.path === a.parent.href)
      expect(hub?.items.some((i) => i.href === a.path), a.path).toBe(true)
    }
  })

  it("close every inline-code span and link", () => {
    for (const text of texts) {
      expect((text.match(/`/g) ?? []).length % 2, text).toBe(0)
      expect((text.match(/\[/g) ?? []).length, text).toBe((text.match(/\]/g) ?? []).length)
    }
  })

  it("say when and where they checked facts about other products", () => {
    for (const a of ARTICLES.filter((a) => a.path.startsWith("/alternatives/"))) {
      expect(a.checked?.date, a.path).toBe(CHECKED)
      expect(a.checked?.sources.length, a.path).toBeGreaterThan(0)
      for (const s of a.checked?.sources ?? []) expect(s.href, a.path).toMatch(/^https:\/\//)
    }
  })
})

describe("code on the pages", () => {
  it("imports only what the Brainbox packages export", () => {
    let checked = 0
    for (const { page, code } of codeBlocks) {
      for (const [, names = "", pkg = ""] of code.matchAll(
        /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"(@ganeshdole\/brainbox-[a-z]+)"/g,
      )) {
        const entry = ENTRIES[pkg]
        expect(entry, `${page}: unknown package ${pkg}`).toBeDefined()
        const exported = exportedNames(entry ?? "")
        for (const name of names.split(",").map((n) => n.trim().replace(/^type\s+/, "")).filter(Boolean)) {
          expect(exported.has(name), `${page}: ${pkg} has no export ${name}`).toBe(true)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it("uses only script-tag attributes the widget documents", () => {
    for (const { page, code } of codeBlocks) {
      for (const [, attr = ""] of code.matchAll(/\b(data-[a-z-]+)=/g)) {
        if (FRAMEWORK_ATTRIBUTES.has(attr)) continue
        expect(WIDGET_README.includes(`\`${attr}\``), `${page}: ${attr}`).toBe(true)
      }
    }
  })

  it("calls only what window.Brainbox has", () => {
    const methods = new Set([...EMBED.matchAll(/^ {2}(\w+)\(/gm)].map((m) => m[1]))
    expect(methods.size).toBeGreaterThan(4)
    const used = [WINDOW_TYPES, ...codeBlocks.map((b) => b.code), ...texts].flatMap((code) =>
      [...code.matchAll(/window\.Brainbox\??\.(\w+)/g)].map((m) => m[1]),
    )
    for (const name of [...used, ...[...WINDOW_TYPES.matchAll(/^ {6}(\w+)\(/gm)].map((m) => m[1])]) {
      expect(methods.has(name), `window.Brainbox.${name}`).toBe(true)
    }
  })

  it("loads the widget from the URL the dashboard hands out", () => {
    const snippet = read("../../../dashboard/src/lib/snippet.ts")
    for (const { code } of codeBlocks) {
      for (const [url = ""] of code.matchAll(/https:\/\/app\.brainbox\.sh\/[a-z.]+(?=["\s])/g)) {
        expect(snippet.includes(url) || url === "https://app.brainbox.sh/ingest", url).toBe(true)
      }
    }
  })

  it("shows the GitHub issue exactly as renderTicket writes it", () => {
    const rendered = renderTicket(GITHUB_SAMPLE.ticket as Ticket)
    expect(rendered.title).toBe(GITHUB_SAMPLE.title)
    expect(rendered.body.trimEnd()).toBe(GITHUB_SAMPLE.body)
  })
})
