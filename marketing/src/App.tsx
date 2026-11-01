import { useEffect } from "react"
import { Nav } from "@/components/site/nav"
import { Hero } from "@/components/site/hero"
import { HowItWorks } from "@/components/site/how-it-works"
import { WhatsIncluded } from "@/components/site/whats-included"
import { Integrations } from "@/components/site/integrations"
import { FeatureRequests } from "@/components/site/feature-requests"
import { Install } from "@/components/site/install"
import { Pricing } from "@/components/site/pricing"
import { Faq } from "@/components/site/faq"
import { Footer } from "@/components/site/footer"
import { loadWidget, resolveWidgetConfig } from "@/lib/widget-loader"

export default function App() {
  // the site runs the real widget - the floating launcher is the product demo
  useEffect(() => {
    loadWidget(resolveWidgetConfig(import.meta.env))
  }, [])

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <WhatsIncluded />
        <Integrations />
        <FeatureRequests />
        <Install />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
