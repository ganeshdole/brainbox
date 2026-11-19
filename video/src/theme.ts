import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

/** The same type and colour decisions as the landing page and the widget. */
export const font = {
  sans: `${inter.fontFamily}, ui-sans-serif, system-ui, sans-serif`,
  mono: `${mono.fontFamily}, ui-monospace, Menlo, monospace`,
};

/** Light host app and light-theme widget (what an end-user sees). */
export const light = {
  page: "#f4f4f5",
  card: "#ffffff",
  line: "#e4e4e7",
  text: "#18181b",
  dim: "#71717a",
  faint: "#a1a1aa",
  elevated: "#f9f9f9",
  brand: "#000000",
};

/** Dark marketing and dashboard surface. */
export const dark = {
  bg: "#000000",
  elevated: "#111111",
  line: "rgba(255,255,255,0.08)",
  text: "#ededed",
  dim: "#a0a0a0",
};

/** GitHub's dark theme, where the ticket lands. */
export const gh = {
  bg: "#0d1117",
  panel: "#161b22",
  line: "#30363d",
  text: "#e6edf3",
  dim: "#8d96a0",
  link: "#4493f8",
  open: "#238636",
  code: "#0b0f14",
  red: "#f85149",
};

/** The widget's default mark colour (`DEFAULT_COLOR` in brainbox-core). */
export const MARK = "#ff4d4f";
