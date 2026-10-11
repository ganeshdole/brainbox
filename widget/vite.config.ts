import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/** Everything the package declares as a dependency or peer stays external in
 *  the ES build, so a host installs one copy of each. */
const pkg = JSON.parse(readFileSync(entry("./package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const externals = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  "react-dom/client",
  "react/jsx-runtime",
];

/** In the script-tag bundle, point core's lazy loaders (`lazy.ts`) at the
 *  script-injecting stand-in, so rrweb and modern-screenshot stay out of
 *  `widget.js` and arrive as `widget-capture.js` on first capture. */
function captureAsSiblingScript(): Plugin {
  const loader = entry("./src/lib/load-capture.ts");
  return {
    name: "brainbox:capture-as-sibling-script",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !source.endsWith("/lazy.ts")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id.includes("/packages/core/src/lazy.ts") ? loader : null;
    },
  };
}

// Three builds from one source (ADR 0003, ADR 0005):
//
// - default: the script-tag bundle `widget.js`, a self-contained IIFE with
//   React, core and the stylesheet (imported `?inline`) all bundled, so the
//   host page loads one file up front.
// - `--mode capture`: `widget-capture.js`, rrweb and modern-screenshot as a
//   second IIFE, fetched by `widget.js` the first time someone captures. Most
//   page views never file a report, so they never pay for these.
// - `--mode lib`: an ES module of the library entry for bundler hosts, with
//   React and the other @brainbox packages left external so the host ends up
//   with one copy of each.
export default defineConfig(({ command, mode }) => {
  const lib = mode === "lib";
  const capture = mode === "capture";
  const script = command === "build" && !lib && !capture;
  return {
    plugins: [react(), tailwindcss(), ...(script ? [captureAsSiblingScript()] : [])],
    resolve: {
      alias: { "@": entry("./src") },
    },
    // Vite doesn't inject process.env.NODE_ENV in lib builds; the bundled React
    // in the IIFE needs it. The ES build leaves React to the host's bundler.
    define: command === "build" && !lib ? { "process.env.NODE_ENV": JSON.stringify("production") } : {},
    build: capture
      ? {
          lib: {
            entry: entry("./src/capture-entry.ts"),
            name: "BrainboxCapture",
            formats: ["iife"],
            fileName: () => "widget-capture.js",
          },
          emptyOutDir: false,
        }
      : lib
      ? {
          lib: {
            entry: entry("./src/index.ts"),
            formats: ["es"],
            fileName: () => "index.js",
          },
          rollupOptions: { external: externals },
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
