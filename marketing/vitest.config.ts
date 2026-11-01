import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone from vite.config.ts: the lib helpers read DOM/window, so unit
// tests run under jsdom. The `@` alias matches vite.config.ts, for the page
// tests that render components.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
