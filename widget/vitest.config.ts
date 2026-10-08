import { defineConfig } from "vitest/config";

// Standalone from vite.config.ts (which is the lib build): the lib functions
// read DOM/window/navigator, so unit tests run under jsdom. Component tests
// render with react-dom/client inside act(); see test-setup.ts.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
