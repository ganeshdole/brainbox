// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The script tag is two files: widget.js loads widget-capture.js from beside
// itself the first time someone captures (lib/load-capture.ts). In the Docker
// image a missing sibling falls through to the dashboard's index.html, so every
// capture fails and reports go out without a screenshot.
describe("the Docker image", () => {
  it("serves widget-capture.js beside widget.js", () => {
    const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    const copies = dockerfile
      .split("\n")
      .filter((line) => line.startsWith("COPY --from=build /app/widget/dist/"))
      .join("\n");
    expect(copies).toMatch(/\/widget\.js\b/);
    expect(copies).toMatch(/\/widget-capture\.js\b/);
  });
});
