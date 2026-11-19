import { defineConfig } from "vitest/config";

// The timeline is pure arithmetic; nothing here needs a DOM.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
