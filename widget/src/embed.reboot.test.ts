import { act } from "react";
import { describe, expect, it, vi } from "vitest";

// embed.ts runs on import. One scenario per file, since the "already loaded"
// claim lives on window: a first tag with no config, then a navigation that
// swaps in a <body> whose tag is right, in "mount" mode.

describe("widget.js after a tag with no config", () => {
  it("boots from a later correct tag, and its data-mount trigger survives a body swap", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<script data-endpoint="http://x/ingest"></script>`;
    await act(() => import("./embed.ts"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("missing data-project"));
    expect(document.getElementById("brainbox-widget")).toBeNull();
    error.mockRestore();

    // The next page brings the tag the host fixed; the first run gave its claim back.
    const fixed = `<script data-project="pk_test" data-endpoint="http://x/ingest" data-mode="mount" data-mount="#trigger"></script>`;
    document.body.innerHTML = `<button id="trigger">Feedback</button>${fixed}`;
    vi.resetModules();
    await act(() => import("./embed.ts"));
    expect(document.getElementById("brainbox-widget")).not.toBeNull();

    // A Turbo-style navigation: a new body with a new #trigger, and the tag run again.
    const next = document.createElement("body");
    next.innerHTML = `<button id="trigger"><span>Feedback</span></button>${fixed}`;
    document.body.replaceWith(next);
    vi.resetModules();
    await act(() => import("./embed.ts"));

    // The trigger on the new body is not the element the first boot saw.
    const open = vi.spyOn(window.Brainbox, "open");
    act(() => document.querySelector<HTMLElement>("#trigger span")?.click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("#brainbox-widget")).toHaveLength(1);

    // A host handler on its own trigger that stops the click going further
    // (a menu that closes itself) still opens feedback.
    document
      .querySelector("#trigger")
      ?.addEventListener("click", (event) => event.stopPropagation());
    act(() => document.querySelector<HTMLElement>("#trigger span")?.click());
    expect(open).toHaveBeenCalledTimes(2);
  });
});
