import { Hero } from "./hero"
import { HowItWorks } from "./how-it-works"
import { WhatsIncluded } from "./whats-included"
import { Integrations } from "./integrations"
import { FeatureRequests } from "./feature-requests"
import { Install } from "./install"
import { Pricing } from "./pricing"
import { Faq } from "./faq"

export function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhatsIncluded />
      <Integrations />
      <FeatureRequests />
      <Install />
      <Pricing />
      <Faq />
    </>
  )
}
