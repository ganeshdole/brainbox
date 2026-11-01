import { useEffect, type ReactNode } from "react"
import { loadWidget, resolveWidgetConfig } from "@/lib/widget-loader"
import { Footer } from "./footer"
import { Nav } from "./nav"

/** Every page: the nav, the footer, and the real widget in the corner. */
export function Layout({ children }: { children: ReactNode }) {
  // the site runs the real widget - the floating launcher is the product demo
  useEffect(() => {
    loadWidget(resolveWidgetConfig(import.meta.env))
  }, [])

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
