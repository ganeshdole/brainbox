import { describe, expect, it } from "vitest"
import { absoluteUrl, breadcrumbs, fillTemplate, headTags, normalizePath, outputFile, robotsTxt, scriptJson, sitemapXml } from "./seo"

const page = { path: "/install/nextjs", title: "Next.js & you", description: 'Say "hi" <now>' }

describe("headTags", () => {
  it("writes the title, description, canonical and Open Graph tags, escaped", () => {
    const head = headTags(page)
    expect(head).toContain("<title>Next.js &amp; you</title>")
    expect(head).toContain('<meta name="description" content="Say &quot;hi&quot; &lt;now&gt;" />')
    expect(head).toContain('<link rel="canonical" href="https://brainbox.sh/install/nextjs" />')
    expect(head).toContain('<meta property="og:url" content="https://brainbox.sh/install/nextjs" />')
    expect(head).not.toContain("noindex")
  })

  it("marks a page noindex, with no canonical, when asked", () => {
    const head = headTags(page, { indexable: false })
    expect(head).toContain('<meta name="robots" content="noindex" />')
    expect(head).not.toContain("canonical")
  })
})

describe("structured data", () => {
  it("writes each JSON-LD object as its own script, with < escaped", () => {
    const head = headTags({ ...page, jsonLd: [{ name: "</script><b>" }, { a: 1 }] })
    expect(head).toContain('<script type="application/ld+json">{"name":"\\u003c/script>\\u003cb>"}</script>')
    expect(head).toContain('<script type="application/ld+json">{"a":1}</script>')
    expect(JSON.parse(scriptJson({ name: "<x>" }))).toEqual({ name: "<x>" })
  })

  it("adds a large preview image", () => {
    expect(headTags(page)).toContain('<meta property="og:image" content="https://brainbox.sh/og.png" />')
    expect(headTags(page)).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })

  it("numbers breadcrumbs from the home page, by absolute URL", () => {
    expect(breadcrumbs([{ name: "Brainbox", path: "/" }, { name: "Install guides", path: "/install" }])).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Brainbox", item: "https://brainbox.sh/" },
        { "@type": "ListItem", position: 2, name: "Install guides", item: "https://brainbox.sh/install" },
      ],
    })
  })
})

describe("fillTemplate", () => {
  const template = '<head><!--app-head--></head><div id="root"><!--app-html--></div>'

  it("puts the head and body in their placeholders and names the page on the root", () => {
    expect(fillTemplate(template, { path: "/a", head: "<title>t</title>", body: "<h1>x</h1>" })).toBe(
      '<head><title>t</title></head><div id="root" data-page="/a"><h1>x</h1></div>',
    )
  })

  it("leaves a $ in the markup alone", () => {
    expect(fillTemplate(template, { path: "/", head: "", body: "From $29/mo, $&" })).toContain("From $29/mo, $&")
  })

  it("throws when index.html has lost a placeholder", () => {
    expect(() => fillTemplate("<head></head>", { path: "/", head: "", body: "" })).toThrow(/placeholder/)
  })
})

describe("paths", () => {
  it("maps a page to its file in dist/", () => {
    expect(outputFile("/")).toBe("index.html")
    expect(outputFile("/install/nextjs")).toBe("install/nextjs.html")
  })

  it("gives the home page a trailing slash and nothing else one", () => {
    expect(absoluteUrl("/")).toBe("https://brainbox.sh/")
    expect(absoluteUrl("/install/nextjs")).toBe("https://brainbox.sh/install/nextjs")
  })

  it("treats a trailing slash as the same page", () => {
    expect(normalizePath("/install/nextjs/")).toBe("/install/nextjs")
    expect(normalizePath("/")).toBe("/")
    expect(normalizePath("")).toBe("/")
  })
})

describe("sitemap and robots", () => {
  it("lists every page by its canonical URL", () => {
    const xml = sitemapXml([{ path: "/" }, { path: "/alternatives/jam", lastmod: "2026-11-01" }])
    expect(xml).toContain("<url><loc>https://brainbox.sh/</loc></url>")
    expect(xml).toContain("<url><loc>https://brainbox.sh/alternatives/jam</loc><lastmod>2026-11-01</lastmod></url>")
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it("allows everything and points at the sitemap", () => {
    expect(robotsTxt()).toBe("User-agent: *\nAllow: /\n\nSitemap: https://brainbox.sh/sitemap.xml\n")
  })
})
