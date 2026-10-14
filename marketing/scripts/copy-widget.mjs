// Dev only (`pnpm dev`) - production loads https://app.brainbox.sh/widget.js,
// the same tag customers paste, so the build no longer needs a bundled copy.
// This puts a locally built widget at /widget.js (and the widget-capture.js it
// loads on first capture beside it) so you can iterate on it by
// setting VITE_DEMO_WIDGET_SRC=/widget.js. If you rebuild the widget
// mid-session, re-run this (or restart `pnpm dev`) - Vite serves public/ from
// disk.
import { execSync } from "node:child_process"
import { copyFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))
const src = fileURLToPath(new URL("../../widget/dist/widget.js", import.meta.url))
const dest = fileURLToPath(new URL("../public/widget.js", import.meta.url))

if (!existsSync(src)) {
  // Standalone-package builds (Vercel, fresh clones) haven't built the widget yet.
  console.log("widget/dist/widget.js not found - building @ganeshdole/brainbox-widget first")
  execSync("pnpm -F @ganeshdole/brainbox-widget build", { cwd: root, stdio: "inherit" })
}
if (!existsSync(src)) {
  console.error("widget build did not produce widget/dist/widget.js")
  process.exit(1)
}
copyFileSync(src, dest)
copyFileSync(src.replace(/widget\.js$/, "widget-capture.js"), dest.replace(/widget\.js$/, "widget-capture.js"))
