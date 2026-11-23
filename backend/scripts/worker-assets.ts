// Gathers what the Worker serves as static assets into backend/.worker-assets:
// the built dashboard, plus the script tag's two files beside it (widget.js
// loads widget-capture.js from next to itself). The same layout the Docker
// `web` image serves from /srv/app. Run after building dashboard and widget.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "backend/.worker-assets");
const sources: [string, string][] = [
  [join(root, "dashboard/dist"), out],
  [join(root, "widget/dist/widget.js"), join(out, "widget.js")],
  [join(root, "widget/dist/widget-capture.js"), join(out, "widget-capture.js")],
];

for (const [from] of sources) {
  if (!existsSync(from)) {
    console.error(`${from} is missing: build the dashboard and the widget first.`);
    process.exit(1);
  }
}
rmSync(out, { recursive: true, force: true });
for (const [from, to] of sources) cpSync(from, to, { recursive: true });
console.log(`Worker assets ready in ${out}`);
