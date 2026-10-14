import type { TriggerMode, WidgetTheme } from "@ganeshdole/brainbox-shared";
import type { Position } from "./position.ts";
import type { StartMode } from "./widget-store.ts";

/** What the script tag asked for, read off its `data-*` attributes. */
export interface WidgetConfig {
  projectKey: string;
  endpoint: string;
  /** `data-mode="mount"` is the manual trigger: the host opens the widget from
   *  its own element (`data-mount`) or `window.Brainbox.open()`. */
  trigger: TriggerMode;
  mount?: string;
  position: Position;
  theme: WidgetTheme;
  /** Whether the chooser offers "Suggest a feature". `data-feature-requests="off"`
   *  hides it; a host's own `start("feature")` works either way. */
  featureRequests: boolean;
}

const POSITIONS: Position[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const THEMES: WidgetTheme[] = ["dark", "light", "system"];

/** Parse the widget config off the embedding <script> tag's data-* attributes. */
export function readConfig(script: HTMLScriptElement | null): WidgetConfig | null {
  const ds = script?.dataset;
  const projectKey = ds?.project;
  const endpoint = ds?.endpoint;
  if (!projectKey || !endpoint) return null;

  const position = ds.position as Position | undefined;
  const theme = ds.theme as WidgetTheme | undefined;
  return {
    projectKey,
    endpoint,
    trigger: ds.mode === "mount" ? "manual" : "floating",
    mount: ds.mount,
    position: position && POSITIONS.includes(position) ? position : "bottom-right",
    theme: theme && THEMES.includes(theme) ? theme : "dark",
    featureRequests: ds.featureRequests !== "off",
  };
}

const START_MODES: StartMode[] = ["screenshot", "record", "feature"];

/** What clicking an element marked `data-brainbox` does: `open` (also the
 *  bare attribute) shows the chooser, a start mode skips it. Null for a value
 *  we don't know, so a typo does nothing rather than something surprising. */
export function triggerAction(value: string | undefined): StartMode | "open" | null {
  if (value === undefined) return null;
  if (value === "" || value === "open") return "open";
  return START_MODES.find((mode) => mode === value) ?? null;
}
