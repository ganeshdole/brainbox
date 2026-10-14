import { shadowCss } from "./shadow-css.ts";
import css from "../index.css?inline";

/** The screens' stylesheet, ready for a shadow root: the design tokens on
 *  `:host`, Tailwind's utilities, and its preflight. Not for a document - the
 *  preflight would reset the host page. Render it as a `<style>` inside the
 *  root, around an element with the `bb-root` class (plus `dark` for the dark
 *  theme); `<BrainboxShadow>` does all of that. */
// Marked pure so a bundler drops the string from a host that imports a
// screen but brings its own styles.
export const widgetCss: string = /* @__PURE__ */ shadowCss(css);
