import { Section, SectionHead } from "./section-head"
import { Shot } from "./shot"

export function FeatureRequests() {
  return (
    <Section id="features">
      <SectionHead
        title="Feature requests, counted."
        desc="Users suggest features from the same widget and say how much it matters to them. You sort each request into a feature, and the most asked for rise to the top."
      />

      <div className="mt-12 overflow-hidden rounded-xl border border-default bg-background">
        <Shot
          name="features"
          className="hidden md:block"
          sizes="(min-width: 1200px) 1120px, calc(100vw - 80px)"
          width={1030}
          height={340}
          alt="The Features page in the Brainbox dashboard: “Save my card for next time” with 2 requests, planned; “Show a delivery date, not 3–5 days” with 1 request, in progress; “Apple Pay at checkout” with 1 request, under review."
        />
        <Shot
          name="features-phone"
          className="md:hidden"
          sizes="calc(100vw - 40px)"
          width={360}
          height={380}
          alt="The Features page in the Brainbox dashboard on a phone: three features with their request counts, “Save my card for next time” first with 2 requests."
        />
      </div>
    </Section>
  )
}
