import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // @brainbox/shared and @brainbox/server ship as TS source with no build
  // output, so they must be bundled in rather than left as external imports.
  noExternal: ["@brainbox/shared", "@brainbox/server"],
});
