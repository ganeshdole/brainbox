// What a crawler sees in each prerendered page's <head>, and the sitemap and
// robots.txt that point it at them. Pure string building, so the build script
// (scripts/prerender.mjs) stays glue and this stays testable.

/** The marketing site's one canonical origin. www and the old domains 308 here. */
export const SITE_URL = "https://brainbox.sh"

/** The picture link previews show (public/og.png, 1200 × 630). */
export const OG_IMAGE = `${SITE_URL}/og.png`

export interface PageMeta {
  /** Root-relative, no trailing slash except the home page's "/". */
  path: string
  title: string
  description: string
  /** schema.org objects, each written as its own JSON-LD script. */
  jsonLd?: readonly object[]
  /** YYYY-MM-DD the content last changed, for the sitemap. Only where it's known. */
  lastmod?: string
}

/** JSON for inside a <script>: `<` escaped, so no value can close the tag. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

/** schema.org BreadcrumbList for a page under the home page. */
export function breadcrumbs(trail: readonly { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  }
}

export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** The tags that replace `<!--app-head-->` in index.html. */
export function headTags(page: PageMeta, { indexable = true } = {}): string {
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const url = escapeHtml(absoluteUrl(page.path))
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    indexable ? `<link rel="canonical" href="${url}" />` : `<meta name="robots" content="noindex" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Brainbox" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...(page.jsonLd ?? []).map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`),
  ]
  return tags.join("\n    ")
}

/**
 * index.html with one page's head tags and server-rendered markup filled in.
 * The root also records which page it holds, so the client hydrates that page
 * even where the HTML is served at another URL (404.html is served at all of them).
 */
export function fillTemplate(
  template: string,
  { path, head, body }: { path: string; head: string; body: string },
): string {
  if (!template.includes("<!--app-head-->") || !template.includes('<div id="root"><!--app-html--></div>')) {
    throw new Error('index.html is missing the <!--app-head--> or <div id="root"><!--app-html--></div> placeholder')
  }
  // Function replacers: a `$` in rendered markup must not be read as a pattern.
  return template
    .replace("<!--app-head-->", () => head)
    .replace('<div id="root"><!--app-html--></div>', () => `<div id="root" data-page="${escapeHtml(path)}">${body}</div>`)
}

/**
 * Where a page's HTML goes in dist/: "/" → index.html, "/a/b" → a/b.html.
 * Vercel's `cleanUrls` (vercel.json) serves a/b.html at /a/b.
 */
export function outputFile(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}.html`
}

export function sitemapXml(pages: readonly Pick<PageMeta, "path" | "lastmod">[]): string {
  const urls = pages.map((p) => {
    const lastmod = p.lastmod ? `<lastmod>${escapeHtml(p.lastmod)}</lastmod>` : ""
    return `  <url><loc>${escapeHtml(absoluteUrl(p.path))}</loc>${lastmod}</url>`
  })
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n")
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
}

/** "/install/nextjs/" and "/install/nextjs" are the same page. */
export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}
