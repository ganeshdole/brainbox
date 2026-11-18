import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// The browser tab icon: every icon <link> in index.html must point at a file
// the build ships, and the SVG must draw its own opaque tile. A white glyph on
// transparency vanished on light tabs.
const root = join(import.meta.dirname, "..")
const html = readFileSync(join(root, "index.html"), "utf8")
const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1] ?? "")

describe("favicon", () => {
  it("links an svg, an ico and an apple-touch icon", () => {
    expect(hrefs).toEqual(["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png"])
  })

  it.each(hrefs)("ships %s", (href) => {
    expect(existsSync(join(root, "public", href))).toBe(true)
  })

  it("draws the mark on an opaque tile", () => {
    const svg = readFileSync(join(root, "public", "favicon.svg"), "utf8")
    expect(svg).toMatch(/<rect width="64" height="64"[^>]*fill="#0a0a0a"/)
  })
})
