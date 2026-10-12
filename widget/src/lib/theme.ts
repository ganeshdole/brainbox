import type { WidgetTheme } from "@ganeshdole/brainbox-shared";

/**
 * Keeps the widget's `.dark` class in step with `theme`, which the stylesheet
 * keys every colour off. "system" follows the visitor's OS setting, live.
 * Returns the cleanup.
 */
export function applyTheme(container: HTMLElement, theme: WidgetTheme): () => void {
  if (theme !== "system") {
    container.classList.toggle("dark", theme === "dark");
    return () => {};
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => container.classList.toggle("dark", prefersDark.matches);
  sync();
  prefersDark.addEventListener("change", sync);
  return () => prefersDark.removeEventListener("change", sync);
}
