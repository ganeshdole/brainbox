import { defineConfig } from "vitest/config";

// The engine reads DOM/window/navigator, so unit tests run under jsdom.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
