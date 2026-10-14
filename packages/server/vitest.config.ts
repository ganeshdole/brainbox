import { defineConfig } from "vitest/config";

// Web-standard Request/FormData/File are Node globals; no DOM, no database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
