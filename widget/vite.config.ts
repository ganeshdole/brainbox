import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// Two library builds from one source (ADR 0003, ADR 0005):
//
// - default: the script-tag bundle `widget.js`, a self-contained IIFE with
//   React, core and the stylesheet (imported `?inline`) all bundled, so the
//   host page only ever loads one file.
// - `--mode lib`: an ES module of the library entry for bundler hosts, with
//   React and the other @brainbox packages left external so the host ends up
//   with one copy of each.
export default defineConfig(({ command, mode }) => {
  const lib = mode === "lib";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": entry("./src") },
    },
    // Vite doesn't inject process.env.NODE_ENV in lib builds; the bundled React
    // in the IIFE needs it. The ES build leaves React to the host's bundler.
    define: command === "build" && !lib ? { "process.env.NODE_ENV": JSON.stringify("production") } : {},
    build: lib
      ? {
          lib: {
            entry: entry("./src/index.ts"),
            formats: ["es"],
            fileName: () => "index.js",
          },
          rollupOptions: {
            external: [
              "react",
              "react-dom",
              "react-dom/client",
              "react/jsx-runtime",
              "@brainbox/core",
              "@brainbox/react",
              "@brainbox/shared",
            ],
          },
          cssCodeSplit: false,
          // the IIFE build has already emptied dist/
          emptyOutDir: false,
        }
      : {
          lib: {
            entry: entry("./src/embed.ts"),
            name: "Brainbox",
            formats: ["iife"],
            fileName: () => "widget.js",
          },
          cssCodeSplit: false,
          emptyOutDir: true,
        },
  };
});
