// Code that several pages show the same way. The tag is the one the dashboard
// hands out (dashboard/src/lib/snippet.ts), with a placeholder key.

export const PROJECT_KEY = "pk_your_project_key"
export const WIDGET_SRC = "https://app.brainbox.sh/widget.js"
export const ENDPOINT = "https://app.brainbox.sh/ingest"

export const TAG = `<script src="${WIDGET_SRC}" data-project="${PROJECT_KEY}" data-endpoint="${ENDPOINT}"></script>`

/** The tag on several lines, indented to sit inside a template. */
export function tagLines(indent: string): string {
  return [`<script`, `  src="${WIDGET_SRC}"`, `  data-project="${PROJECT_KEY}"`, `  data-endpoint="${ENDPOINT}"`, `></script>`]
    .map((line) => indent + line)
    .join("\n")
}

/** For TypeScript apps that call window.Brainbox. */
export const WINDOW_TYPES = `declare global {
  interface Window {
    Brainbox?: {
      identify(user: { id?: string; email?: string; name?: string }): void
      open(): void
      start(mode: "screenshot" | "record" | "feature"): void
      close(): void
    }
  }
}

export {}`
