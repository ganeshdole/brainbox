import { describe, expect, it } from "vitest"
import { shotSources } from "./shots"

const files = {
  "/src/assets/shots/report-1680.webp": "/a/report-1680.webp",
  "/src/assets/shots/report-1120.webp": "/a/report-1120.webp",
  "/src/assets/shots/report-1120.avif": "/a/report-1120.avif",
  "/src/assets/shots/report-phone-title-720.webp": "/a/report-phone-title-720.webp",
  "/src/assets/shots/report-phone-title-720.avif": "/a/report-phone-title-720.avif",
}

describe("shotSources", () => {
  it("builds srcsets for one name, smallest first", () => {
    expect(shotSources(files, "report")).toEqual({
      avif: "/a/report-1120.avif 1120w",
      webp: "/a/report-1120.webp 1120w, /a/report-1680.webp 1680w",
      fallback: "/a/report-1120.webp",
    })
  })

  it("does not mix in a longer name that starts the same way", () => {
    expect(shotSources(files, "report-phone-title").webp).toBe("/a/report-phone-title-720.webp 720w")
  })

  it("fails loudly for a shot with no files", () => {
    expect(() => shotSources(files, "missing")).toThrow(/missing/)
  })
})
