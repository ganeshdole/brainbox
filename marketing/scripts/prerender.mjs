// Last build step: turn the client build's empty index.html into one real HTML
// page per route, so crawlers and link previews get the content and the right
// <head> without running JavaScript. The client then hydrates it.
//
// Runs after `vite build` (dist/) and `vite build --ssr src/entry-server.tsx`
// (dist-ssr/). All the logic lives in src/lib/seo.ts and src/pages.tsx; this
// only reads and writes files.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const dist = join(root, "dist")
const ssrDir = join(root, "dist-ssr")

const server = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href)
const template = readFileSync(join(dist, "index.html"), "utf8")

function write(file, contents) {
  const target = join(dist, file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

function page(p, options) {
  return server.fillTemplate(template, { path: p.path, head: server.headTags(p, options), body: server.render(p) })
}

for (const p of server.PAGES) {
  write(server.outputFile(p.path), page(p))
  console.log(`prerendered ${p.path}`)
}
write("404.html", page(server.NOT_FOUND, { indexable: false }))
write("sitemap.xml", server.sitemapXml(server.PAGES))
write("robots.txt", server.robotsTxt())

rmSync(ssrDir, { recursive: true, force: true })
