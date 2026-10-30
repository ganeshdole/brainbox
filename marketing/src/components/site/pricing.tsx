import { useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  OVERAGE_CENTS_PER_TICKET,
  PLANS,
  annualMonthsFree,
  annualSavingsPercent,
  displayPriceCents,
  formatUsd,
  maxAnnualMonthsFree,
  type BillingPeriod,
} from "@/lib/pricing"
import { checkoutUrl } from "@/lib/signup"
import { Section, SectionHead } from "./section-head"

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
]

const MAX_MONTHS_FREE = maxAnnualMonthsFree()

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>("annual")

  return (
    <Section id="pricing">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <SectionHead
          title="Priced by reports, not seats."
          desc="Every plan has unlimited projects, teammates and pageviews, with recordings and console errors included."
        />

        <div className="flex flex-col items-start gap-2 md:items-end">
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="inline-flex rounded-lg border border-default p-0.5"
          >
            {PERIODS.map((p, i) => (
              <button
                key={p.value}
                role="radio"
                aria-checked={period === p.value}
                // Roving tabindex: a radio group is ONE tab stop, and arrow keys
                // move within it. Leaving every option tabbable makes a keyboard
                // user tab through each one, which is not the expected pattern.
                tabIndex={period === p.value ? 0 : -1}
                onKeyDown={(e) => {
                  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return
                  e.preventDefault()
                  const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1
                  const next = PERIODS[(i + delta + PERIODS.length) % PERIODS.length]
                  if (!next) return
                  setPeriod(next.value)
                  // Selection follows focus, so move focus with it.
                  const group = e.currentTarget.parentElement
                  const buttons = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                  buttons?.[(i + delta + PERIODS.length) % PERIODS.length]?.focus()
                }}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "h-8 rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-focus",
                  period === p.value ? "bg-interactive-hover text-emphasis" : "text-gray-10 hover:text-emphasis"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-gray-10">Up to {MAX_MONTHS_FREE} months free on annual</span>
        </div>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "flex flex-col rounded-xl border p-7 md:p-8",
              plan.featured ? "border-interactive bg-subtle" : "border-default"
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-[560] text-emphasis">{plan.name}</h3>
              {plan.featured && <span className="text-[13px] text-gray-10">Most popular</span>}
            </div>
            <p className="mt-1 text-[15px] text-gray-10">{plan.tagline}</p>

            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="text-[44px] leading-none font-[560] tracking-[-0.03em] text-emphasis">
                {formatUsd(displayPriceCents(plan, period))}
              </span>
              <span className="text-[15px] text-gray-10">/ month</span>
            </div>
            {/* Each card states its OWN saving - the two plans discount at
                different rates, so one figure for both would misstate one. */}
            <p className="mt-2 text-[13px] text-gray-10">
              {period === "annual" ? (
                <>
                  {formatUsd(plan.annualCents)} billed yearly &middot; save{" "}
                  {annualSavingsPercent(plan)}%, {annualMonthsFree(plan)} months free
                </>
              ) : (
                <>
                  Billed monthly &middot;{" "}
                  <button
                    type="button"
                    onClick={() => setPeriod("annual")}
                    className="cursor-pointer text-emphasis underline-offset-4 hover:underline"
                  >
                    save {annualSavingsPercent(plan)}% with annual
                  </button>
                </>
              )}
            </p>

            <Button
              asChild
              variant={plan.featured ? "default" : "secondary"}
              className="mt-6 w-full rounded-lg"
            >
              {/* Straight to checkout for THIS plan and period - someone who
                  picked "Business, annual" should not have to choose again on
                  the other side of sign-in. */}
              <a href={checkoutUrl(plan.id, period)}>Get {plan.name}</a>
            </Button>

            <p className="mt-7 border-t border-default pt-6 text-[15px] font-[560] text-emphasis">
              {plan.ticketsPerMonth.toLocaleString("en-US")} tickets a month
            </p>
            <ul className="mt-4 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[15px] text-default">
                  <Check className="mt-[3px] size-4 shrink-0 text-gray-10" strokeWidth={2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 max-w-[640px] text-[15px] leading-[1.55] text-gray-10">
        60-day money-back guarantee, and you can cancel any time. Go over your allowance and
        it&rsquo;s {formatUsd(OVERAGE_CENTS_PER_TICKET)} per extra ticket; we never drop your
        users&rsquo; feedback to enforce a limit.
      </p>
    </Section>
  )
}
