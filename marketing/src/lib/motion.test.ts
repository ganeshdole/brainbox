import { afterEach, describe, expect, it, vi } from "vitest"
import { EASE_OUT, revealOnOpen } from "./motion"

function disclosure({ open }: { open: boolean }) {
  const details = document.createElement("details")
  details.innerHTML = "<summary>Will it slow my app down?</summary><p>No.</p>"
  details.open = open
  const summary = details.querySelector("summary")!
  const answer = details.querySelector("p")!
  // jsdom has no Web Animations API; record what would have played.
  const animate = vi.fn()
  for (const el of [summary, answer]) Object.assign(el, { animate })
  // The real click: our handler first, then the browser's toggle.
  summary.addEventListener("click", () => revealOnOpen(summary))
  return { details, summary, animate, answer }
}

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce") }))
}

afterEach(() => vi.unstubAllGlobals())

describe("revealOnOpen", () => {
  it("settles the answer in with a short drop on the site's ease-out as the disclosure opens", () => {
    prefersReducedMotion(false)
    const { details, summary, animate, answer } = disclosure({ open: false })
    summary.click()
    expect(details.open).toBe(true)
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.contexts[0]).toBe(answer)
    expect(animate).toHaveBeenCalledWith(
      [
        { opacity: 0, transform: "translateY(-4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 200, easing: EASE_OUT },
    )
  })

  it("plays on every open and never on close", () => {
    prefersReducedMotion(false)
    const { details, summary, animate } = disclosure({ open: false })
    summary.click() // open
    summary.click() // close
    summary.click() // open
    expect(details.open).toBe(true)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it("fades without moving under reduced motion", () => {
    prefersReducedMotion(true)
    const { summary, animate } = disclosure({ open: false })
    summary.click()
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 200 }))
  })

  it("leaves a summary outside a <details> alone", () => {
    const summary = document.createElement("summary")
    expect(() => revealOnOpen(summary)).not.toThrow()
  })

  it("uses the curve index.css defines, when the page has it", () => {
    prefersReducedMotion(false)
    document.documentElement.style.setProperty("--ease-out", "cubic-bezier(0.2, 1, 0.3, 1)")
    const { summary, animate } = disclosure({ open: false })
    summary.click()
    document.documentElement.style.removeProperty("--ease-out")
    expect(animate).toHaveBeenCalledWith(expect.anything(), { duration: 200, easing: "cubic-bezier(0.2, 1, 0.3, 1)" })
  })

  it("still opens, without motion, where the Web Animations API is missing", () => {
    const details = document.createElement("details")
    details.innerHTML = "<summary>q</summary><p>a</p>"
    const summary = details.querySelector("summary")!
    summary.addEventListener("click", () => revealOnOpen(summary))
    expect(() => summary.click()).not.toThrow()
    expect(details.open).toBe(true)
  })
})
