import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // The workspace packages resolve to TS source inside the monorepo, so they
  // must be bundled in rather than left as external imports.
  noExternal: ["@brainbox/shared", "@brainbox/server", "@brainbox/integrations"],
});
