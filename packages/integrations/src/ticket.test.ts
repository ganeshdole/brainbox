import { describe, expect, it } from "vitest";
import type { CapturedMetadata } from "@ganeshdole/brainbox-shared";

import { renderTicket, type Ticket } from "./ticket.ts";

const metadata: CapturedMetadata = {
  url: "https://app.example.com/billing",
  title: "Billing · Example",
  viewport: { width: 1440, height: 900 },
  devicePixelRatio: 2,
  userAgent: "Mozilla/5.0 (Macintosh) Chrome/130",
  language: "en-US",
  timezone: "Europe/Berlin",
  consoleErrors: [],
};

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "iss_1",
    createdAt: "2026-10-11T09:30:00.000Z",
    metadata,
    links: { dashboard: "https://app.brainbox.sh/projects/p1/issues/iss_1" },
    ...overrides,
  };
}

describe("renderTicket title", () => {
  it("uses the first non-empty line of the text, whitespace collapsed", () => {
    const t = ticket({ text: "\n\n  The save   button\tdoes nothing\nSecond line" });
    expect(renderTicket(t).title).toBe("The save button does nothing");
  });

  it("truncates a long first line with an ellipsis at 72 chars", () => {
    const t = ticket({ text: "a".repeat(100) });
    const { title } = renderTicket(t);
    expect(title).toHaveLength(72);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to the transcript, then to the page title, then to the URL", () => {
    expect(renderTicket(ticket({ transcript: "it crashed" })).title).toBe("it crashed");
    expect(renderTicket(ticket()).title).toBe("Feedback on Billing · Example");
    expect(
      renderTicket(ticket({ metadata: { ...metadata, title: "  " } })).title,
    ).toBe("Feedback on https://app.example.com/billing");
  });
});

describe("renderTicket body", () => {
  it("renders the full layout for a complete ticket", () => {
    const t = ticket({
      text: "Clicking save does nothing.",
      transcript: "I pressed save\nand nothing happened",
      region: { x: 1, y: 2, width: 3, height: 4, selector: "form > button.save" },
      metadata: {
        ...metadata,
        identity: { email: "jane@example.com" },
        consoleErrors: ["TypeError: x is undefined"],
      },
      links: {
        dashboard: "https://app.brainbox.sh/i/1",
        screenshot: "https://api.brainbox.sh/f/shot",
        crop: "https://api.brainbox.sh/f/crop",
        replay: "https://app.brainbox.sh/i/1#replay",
      },
    });

    expect(renderTicket(t).body).toBe(
      [
        "![Highlighted region](https://api.brainbox.sh/f/crop)",
        "",
        "Clicking save does nothing.",
        "",
        "**Voice note**",
        "",
        "> I pressed save",
        "> and nothing happened",
        "",
        "| | |",
        "|---|---|",
        "| Page | [Billing · Example](https://app.example.com/billing) |",
        "| Viewport | 1440 × 900 @2x |",
        "| Browser | Mozilla/5.0 (Macintosh) Chrome/130 |",
        "| Locale | en-US, Europe/Berlin |",
        "| User | jane@example.com |",
        "| Element | `form > button.save` |",
        "| Reported | 2026-10-11T09:30:00.000Z |",
        "",
        "<details>",
        "<summary>1 console error</summary>",
        "",
        "```",
        "TypeError: x is undefined",
        "```",
        "",
        "</details>",
        "",
        "[Open in Brainbox](https://app.brainbox.sh/i/1) · [Session replay](https://app.brainbox.sh/i/1#replay) · [Full screenshot](https://api.brainbox.sh/f/shot)",
        "",
      ].join("\n"),
    );
  });

  it("shows the screenshot inline when there is no crop, and no image when there is neither", () => {
    const shot = renderTicket(
      ticket({ links: { dashboard: "d", screenshot: "https://x/shot" } }),
    ).body;
    expect(shot.startsWith("![Screenshot](https://x/shot)")).toBe(true);
    expect(shot).not.toContain("Full screenshot");

    const none = renderTicket(ticket()).body;
    expect(none).not.toContain("![");
    expect(none.startsWith("| | |")).toBe(true);
  });

  it("falls back to the metadata selector and to 'anonymous'", () => {
    const body = renderTicket(
      ticket({ metadata: { ...metadata, selector: "#root" } }),
    ).body;
    expect(body).toContain("| Element | `#root` |");
    expect(body).toContain("| User | anonymous |");
  });

  it("names the reporter and lists the app's own fields as it labelled them", () => {
    const body = renderTicket(
      ticket({
        metadata: {
          ...metadata,
          identity: { email: "jane@example.com", name: "Jane Roe", phone: "+1 555 0100" },
          fields: [
            { label: "Clinic", value: "Acme | Vet" },
            { label: "Tenant ID", value: "t-1", type: "id" },
          ],
        },
      }),
    ).body;
    expect(body).toContain("| User | Jane Roe <jane@example.com> |");
    expect(body).toContain("| Phone | +1 555 0100 |");
    expect(body).toContain("| Clinic | Acme \\| Vet |");
    expect(body).toContain("| Tenant ID | t-1 |");
  });

  it("names a reporter known only by phone instead of calling them anonymous", () => {
    const body = renderTicket(
      ticket({ metadata: { ...metadata, identity: { phone: "+1 555 0100" } } }),
    ).body;
    expect(body).toContain("| User | +1 555 0100 |");
  });

  it("skips a blank reporter name or phone rather than leaving cells blank", () => {
    for (const blank of ["", "   "]) {
      const body = renderTicket(
        ticket({ metadata: { ...metadata, identity: { name: blank, phone: blank, email: "jane@example.com" } } }),
      ).body;
      expect(body).toContain("| User | jane@example.com |");
      expect(body).not.toContain("| Phone |");
    }
  });

  it("escapes pipes and newlines inside table cells", () => {
    const body = renderTicket(
      ticket({ metadata: { ...metadata, title: "A | B\nC", userAgent: "UA|1" } }),
    ).body;
    expect(body).toContain("| Page | [A \\| B C](https://app.example.com/billing) |");
    expect(body).toContain("| Browser | UA\\|1 |");
  });

  it("caps console errors at 20 and says how many more there were", () => {
    const errors = Array.from({ length: 23 }, (_, i) => `err ${i}`);
    const body = renderTicket(ticket({ metadata: { ...metadata, consoleErrors: errors } })).body;
    expect(body).toContain("<summary>23 console errors</summary>");
    expect(body).toContain("err 19");
    expect(body).not.toContain("err 20\n");
    expect(body).toContain("… and 3 more");
  });
});
