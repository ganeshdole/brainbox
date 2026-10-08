import { defineConfig } from "vitest/config";

// Hooks render into a jsdom document via react-dom/client; see setup.ts.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
