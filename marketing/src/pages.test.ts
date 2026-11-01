import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import App from "./App"
import { findPage, NOT_FOUND, PAGES } from "./pages"

const html = (path: string) => renderToString(createElement(App, { page: findPage(path) }))
const home = html("/")
const homeIds = new Set([...home.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))

describe("pages", () => {
  it("finds a page with or without a trailing slash, and the 404 for anything else", () => {
    expect(findPage("/install/nextjs/").path).toBe("/install/nextjs")
    expect(findPage("/nope")).toBe(NOT_FOUND)
  })

  it("have unique paths, titles and descriptions", () => {
    for (const key of ["path", "title", "description"] as const) {
      const values = PAGES.map((p) => p[key])
      expect(new Set(values).size, key).toBe(values.length)
    }
  })

  it.each(PAGES.map((p) => p.path))("%s renders with one h1", (path) => {
    expect(html(path).match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it.each([...PAGES.map((p) => p.path), NOT_FOUND.path])("%s links only to pages and sections that exist", (path) => {
    for (const [, href = ""] of html(path).matchAll(/href="(\/[^"]*)"/g)) {
      if (href.startsWith("/assets/")) continue
      const [target = "", hash] = href.split("#")
      expect(findPage(target), href).not.toBe(NOT_FOUND)
      if (hash) expect(target === "/" && homeIds.has(hash), href).toBe(true)
    }
  })
})
