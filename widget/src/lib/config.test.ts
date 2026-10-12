import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

function script(attrs: Record<string, string>): HTMLScriptElement {
  const s = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  return s;
}

describe("readConfig", () => {
  it("parses data-* with sensible defaults", () => {
    const cfg = readConfig(
      script({ "data-project": "pk_abc", "data-endpoint": "http://x/ingest" }),
    );
    expect(cfg).toMatchObject({
      projectKey: "pk_abc",
      endpoint: "http://x/ingest",
      trigger: "floating",
      position: "bottom-right",
      theme: "dark",
    });
  });

  it("reads data-theme, keeping dark for an unknown one", () => {
    const base = { "data-project": "pk_a", "data-endpoint": "e" };
    expect(readConfig(script({ ...base, "data-theme": "light" }))?.theme).toBe("light");
    expect(readConfig(script({ ...base, "data-theme": "system" }))?.theme).toBe("system");
    expect(readConfig(script({ ...base, "data-theme": "sepia" }))?.theme).toBe("dark");
  });

  it("maps data-mode=\"mount\" to the manual trigger, with mount and position", () => {
    const cfg = readConfig(
      script({
        "data-project": "pk_a",
        "data-endpoint": "e",
        "data-mode": "mount",
        "data-mount": "#trigger",
        "data-position": "top-left",
      }),
    );
    expect(cfg?.trigger).toBe("manual");
    expect(cfg?.mount).toBe("#trigger");
    expect(cfg?.position).toBe("top-left");
  });

  it("falls back to bottom-right on an unknown position", () => {
    const cfg = readConfig(
      script({ "data-project": "pk_a", "data-endpoint": "e", "data-position": "middle" }),
    );
    expect(cfg?.position).toBe("bottom-right");
  });

  it("returns null when project key or endpoint is missing", () => {
    expect(readConfig(script({ "data-endpoint": "e" }))).toBeNull();
    expect(readConfig(script({ "data-project": "pk_a" }))).toBeNull();
    expect(readConfig(null)).toBeNull();
  });
});
