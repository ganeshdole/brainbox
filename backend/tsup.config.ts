import { defineConfig } from "tsup";

export default defineConfig({
  // index.ts: the Node server. azure.ts: the Azure Functions app (package.json "main").
  entry: ["src/index.ts", "src/azure.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // The workspace packages resolve to TS source inside the monorepo, so they
  // must be bundled in rather than left as external imports.
  noExternal: ["@ganeshdole/brainbox-shared", "@ganeshdole/brainbox-server", "@ganeshdole/brainbox-integrations"],
});
