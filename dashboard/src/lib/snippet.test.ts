import { describe, expect, it } from "vitest";

import { FEATURE_BUTTON_SNIPPET, snippetFor, WIDGET_SRC } from "./snippet";

describe("snippetFor", () => {
  it("builds a script tag scoped to the project key and endpoint", () => {
    const snippet = snippetFor("pk_abc123", "https://api.example.com/ingest");
    expect(snippet).toBe(
      `<script src="${WIDGET_SRC}" data-project="pk_abc123" data-endpoint="https://api.example.com/ingest"></script>`,
    );
  });
});

describe("FEATURE_BUTTON_SNIPPET", () => {
  it("marks the button with the attribute the widget listens for", () => {
    const button = new DOMParser().parseFromString(FEATURE_BUTTON_SNIPPET, "text/html").querySelector("button");
    expect(button?.dataset.brainbox).toBe("feature");
  });
});
