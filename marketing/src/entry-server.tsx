// The build's server entry (`vite build --ssr`): scripts/prerender.mjs imports
// this bundle to write one HTML file per page.
import { StrictMode } from "react"
import { renderToString } from "react-dom/server"
import App from "./App.tsx"
import { NOT_FOUND, PAGES, type Page } from "./pages.tsx"

export { fillTemplate, headTags, outputFile, robotsTxt, sitemapXml } from "./lib/seo.ts"
export { NOT_FOUND, PAGES }

export function render(page: Page): string {
  return renderToString(
    <StrictMode>
      <App page={page} />
    </StrictMode>,
  )
}
