import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { Analytics } from "@vercel/analytics/react"
import "./index.css"
import App from "./App.tsx"
import { findPage } from "./pages.tsx"

const root = document.getElementById("root")
if (!root) throw new Error("Root element #root not found")

// A prerendered page names itself (data-page): hydrate that one, whatever the
// URL, or React would patch a mismatched tree. The dev server's bare
// index.html doesn't, so there the URL picks.
const prerendered = root.dataset.page
const page = findPage(prerendered ?? window.location.pathname)
const app = (
  <StrictMode>
    <App page={page} />
    <Analytics />
  </StrictMode>
)

if (prerendered !== undefined) {
  hydrateRoot(root, app)
} else {
  // what the build's <head> would have said
  document.title = page.title
  createRoot(root).render(app)
}
