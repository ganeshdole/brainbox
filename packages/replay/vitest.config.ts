import { defineConfig } from "vitest/config";

// The helpers are pure; jsdom is here for the DOM types the component needs.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
