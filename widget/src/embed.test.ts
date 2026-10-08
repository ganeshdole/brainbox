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
    expect(labels().some((l) => l.startsWith("Screenshot"))).toBe(true);

    act(() => window.Brainbox.close());
    expect(labels()).toEqual([]);

    act(() => window.Brainbox.open());
    expect(labels()).toContain("Close");
  });
});
