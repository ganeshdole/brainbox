/**
 * The Reels are a series: one vague message an end-user really sends, and
 * the ticket Brainbox writes for the same bug. Each episode is data, so a new
 * Reel is a new entry here, not new components.
 *
 * The ticket shown is what `renderTicket()` writes for the episode's report:
 * `reels.test.ts` builds that report and renders it, to keep the two in step.
 */

export interface Episode {
  /** Composition id suffix: lowercase letters and dashes. */
  id: string;
  /** What lands in #support, in order. */
  messages: readonly string[];
  /** The one line Reel 2 leads with: the vaguest of them. */
  said: string;
  /** What the end-user said into the widget. The ticket title is its first line. */
  transcript: string;
  issue: number;
  /** The page as the report records it. */
  page: { title: string; url: string };
  viewport: { width: number; height: number; dpr: number };
  browser: string;
  /** The element under the box the end-user drew. */
  selector: string;
  consoleErrors: readonly string[];
  /** The control the end-user circled, as the crop shows it. `missing` draws an
   *  empty slot: the bug is that it isn't there. */
  marked: { label: string; missing?: boolean };
}

export const EPISODES: readonly Episode[] = [
  {
    id: "checkout",
    messages: ["hey the checkout is broken", "it just does nothing??", "can u fix asap"],
    said: "hey the checkout is broken",
    transcript: "I hit Pay now and nothing happens. Tried it twice.",
    issue: 482,
    page: { title: "Checkout", url: "https://app.acme.dev/checkout" },
    viewport: { width: 390, height: 844, dpr: 3 },
    browser: "Safari 18.4 · iOS",
    selector: "button.checkout__pay",
    consoleErrors: ["TypeError: Cannot read properties of undefined (reading 'token')", "POST /api/pay 500 (Internal Server Error)"],
    marked: { label: "Pay now" },
  },
  {
    id: "export",
    messages: ["where did export go", "i need it for the board meeting", "the export button is gone??"],
    said: "the export button is gone??",
    transcript: "There used to be an Export button right here. Now it's just gone.",
    issue: 517,
    page: { title: "Reports", url: "https://app.acme.dev/reports" },
    viewport: { width: 1440, height: 900, dpr: 2 },
    browser: "Chrome 131 · Windows",
    selector: "div.reports__toolbar",
    consoleErrors: ["GET /api/flags/reports-export 403 (Forbidden)"],
    marked: { label: "Export", missing: true },
  },
  {
    id: "phone",
    messages: ["can't log in", "tried 3 times", "it doesn't work on my phone"],
    said: "it doesn't work on my phone",
    transcript: "The keyboard covers the sign in button and I can't scroll down to it.",
    issue: 533,
    page: { title: "Sign in", url: "https://app.acme.dev/login" },
    viewport: { width: 390, height: 664, dpr: 3 },
    browser: "Safari 18.4 · iOS",
    selector: "button.login__submit",
    consoleErrors: ["ResizeObserver loop completed with undelivered notifications."],
    marked: { label: "Sign in" },
  },
];

/** The ticket title, the way `renderTicket()` makes it from a spoken report:
 *  the first non-empty line, whitespace collapsed, cut at 72 characters. */
export function titleOf(ep: Episode): string {
  const line = ep.transcript
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const spoken = (line ?? "").replace(/\s+/g, " ");
  return spoken.length <= 72 ? spoken : `${spoken.slice(0, 71).trimEnd()}…`;
}

/** The details rows the Reel shows, in the order the ticket writes them. A
 *  subset: the Reel leaves out Locale, User and Reported to stay legible. */
export function detailsOf(ep: Episode): [label: string, value: string, code?: boolean][] {
  return [
    ["Page", ep.page.title],
    ["Viewport", `${ep.viewport.width} × ${ep.viewport.height} @${ep.viewport.dpr}x`],
    ["Browser", ep.browser],
    ["Element", ep.selector, true],
  ];
}
