import { afterEach, describe, expect, it, vi } from "vitest";

import type { Store } from "../store/index.ts";

vi.mock("../env.ts", () => ({ env: { STATUS_WEBHOOK_URL: "", STATUS_WEBHOOK_SECRET: "" } }));

const { htmlToText, notifyStatus, statusWebhookConfigured } = await import("./status-webhook.ts");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifyStatus", () => {
  it("calls nothing and records nothing when STATUS_WEBHOOK_URL is unset", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // Any store read would throw: an unset URL must not get that far.
    const store = new Proxy({} as Store, {
      get() {
        throw new Error("the store was read");
      },
    });
    expect(statusWebhookConfigured()).toBe(false);
    expect(await notifyStatus(store, "update-1")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("htmlToText", () => {
  it("keeps line breaks, drops tags and reads entities", () => {
    expect(htmlToText("<div>Fixed in 2.3</div><div>Thanks &amp; sorry<br>&lt;Ana&gt;</div>")).toBe(
      "Fixed in 2.3\nThanks & sorry\n<Ana>",
    );
    expect(htmlToText("plain")).toBe("plain");
  });
});
