import { act } from "react";
import { describe, expect, it } from "vitest";

// embed.ts runs on import, so this file is one scenario: a page with a pasted
// snippet in "mount" mode and a trigger of its own. jsdom's document is already
// "complete" when the import runs, so the widget mounts straight away.

const shadow = () => document.getElementById("brainbox-widget")?.shadowRoot ?? null;
const labels = () =>
  Array.from(shadow()?.querySelectorAll("button") ?? []).map(
    (b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "",
  );

/** Let the widget's lazily loaded UI chunk (`widget-ui.tsx`) arrive and render. */
const uiReady = () =>
  act(async () => {
    await import("./widget-ui.tsx");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("widget.js", () => {
  it("honours data-mode=mount and data-mount, and publishes window.Brainbox", async () => {
    document.body.innerHTML = `
      <button id="trigger">Feedback</button>
      <script data-project="pk_test" data-endpoint="http://x/ingest" data-mode="mount" data-mount="#trigger"></script>
    `;

    await act(() => import("./embed.ts"));

    expect(typeof window.Brainbox.open).toBe("function");
    expect(document.getElementById("brainbox-widget")).not.toBeNull();
    // manual trigger: nothing of ours until the host's button is clicked
    expect(labels()).toEqual([]);

    act(() => document.getElementById("trigger")?.click());
    await uiReady();
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(true);

    act(() => window.Brainbox.close());
    expect(labels()).toEqual([]);

    act(() => window.Brainbox.open());
    expect(labels()).toContain("Close");
    act(() => window.Brainbox.close());

    // A data-brainbox button the page adds after the widget booted, with a
    // child the click lands on, goes straight to the feature-request form.
    const idea = document.createElement("button");
    idea.dataset.brainbox = "feature";
    idea.innerHTML = "<span>Request a feature</span>";
    document.body.appendChild(idea);
    act(() => idea.querySelector("span")?.click());
    expect(shadow()?.querySelector("textarea")?.getAttribute("aria-label")).toBe("Your idea");
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(false);
  });
});
