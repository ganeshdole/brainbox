import { act } from "react";
import { describe, expect, it, vi } from "vitest";

// Turbo Drive, Livewire and htmx swap in the next page's <body> and run the
// scripts in it, so the pasted tag runs again on every navigation.

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const tag = `<script data-project="pk_test" data-endpoint="http://x/ingest"></script>`;

describe("widget.js on an app that swaps <body> to navigate", () => {
  it("stays on the page, once, through a navigation that replaces the body and re-runs the tag", async () => {
    document.body.innerHTML = `<main>page one</main>${tag}`;
    await act(() => import("./embed.ts"));
    const api = window.Brainbox;
    const host = document.getElementById("brainbox-widget");
    expect(host).not.toBeNull();

    // the navigation: a new body, with the tag in it, and the tag run again
    const next = document.createElement("body");
    next.innerHTML = `<main>page two</main>${tag}`;
    document.body.replaceWith(next);
    vi.resetModules();
    await act(() => import("./embed.ts"));
    await settle();

    expect(document.querySelectorAll("#brainbox-widget")).toHaveLength(1);
    expect(document.querySelectorAll("[data-brainbox-root]")).toHaveLength(1);
    expect(document.getElementById("brainbox-widget")).toBe(host);
    expect(host?.parentElement).toBe(next);
    expect(window.Brainbox).toBe(api);
  });
});
