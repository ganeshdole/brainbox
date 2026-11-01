import { afterEach, describe, expect, it } from "vitest";
import { keepOnPage } from "./keep-on-page.ts";

// MutationObserver callbacks run as a microtask after the change.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const releases: (() => void)[] = [];
function kept(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  releases.push(keepOnPage(el));
  return el;
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
  document.body.innerHTML = "";
});

describe("keepOnPage", () => {
  it("puts an element back when the body's children are swapped (htmx, morphing)", async () => {
    const el = kept();
    document.body.innerHTML = "<main>next page</main>";
    await settle();
    expect(el.parentElement).toBe(document.body);
    expect(document.body.querySelector("main")?.textContent).toBe("next page");
  });

  it("moves it into a new body when the body itself is replaced (Turbo, Livewire, Astro)", async () => {
    const el = kept();
    const next = document.createElement("body");
    next.innerHTML = "<main>next page</main>";
    document.body.replaceWith(next);
    await settle();
    expect(el.parentElement).toBe(next);

    // and keeps watching the new one
    const after = document.createElement("body");
    document.body.replaceWith(after);
    await settle();
    expect(el.parentElement).toBe(after);
  });

  it("keeps the element itself, so what is inside it survives", async () => {
    const el = kept();
    const shadow = el.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>open panel</p>";
    document.body.replaceWith(document.createElement("body"));
    await settle();
    expect(document.body.lastElementChild).toBe(el);
    expect(el.shadowRoot?.textContent).toBe("open panel");
  });

  it("marks it so Turbo leaves it out of cached snapshots", () => {
    expect(kept().hasAttribute("data-turbo-temporary")).toBe(true);
  });

  it("lets it go once released", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const release = keepOnPage(el);
    release();
    el.remove();
    await settle();
    expect(el.isConnected).toBe(false);
  });

  it("leaves it where the host moved it", async () => {
    const el = kept();
    const box = document.createElement("section");
    document.body.appendChild(box);
    box.appendChild(el);
    await settle();
    expect(el.parentElement).toBe(box);
  });

  it("does not bring back elements that aren't ours", async () => {
    kept();
    const other = document.createElement("aside");
    document.body.appendChild(other);
    document.body.innerHTML = "";
    await settle();
    expect(other.isConnected).toBe(false);
  });
});
