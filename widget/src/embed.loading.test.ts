import { describe, expect, it, vi } from "vitest";

// embed.ts runs on import. Here the page is still loading when it does, as for
// a plain <script> in the <head>: calls made before DOMContentLoaded must not
// be lost.

const mount = vi.hoisted(() => vi.fn(() => ({ identify: vi.fn(), setFields: vi.fn() })));
vi.mock("./mount.tsx", () => ({ mount }));

describe("widget.js before the page has loaded", () => {
  it("keeps who is reporting and the app's fields until the widget mounts", async () => {
    document.body.innerHTML = `<script data-project="pk_test" data-endpoint="http://x/ingest"></script>`;
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

    await import("./embed.ts");
    window.Brainbox.identify({ email: "ana@acme.co" });
    window.Brainbox.setFields([{ label: "Plan", value: "Pro" }]);
    expect(mount).not.toHaveBeenCalled();

    readyState.mockRestore();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(mount).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { email: "ana@acme.co" },
        fields: [{ label: "Plan", value: "Pro" }],
      }),
    );
  });
});
