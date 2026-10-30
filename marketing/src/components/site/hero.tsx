import { Button } from "@/components/ui/button"
import { openWidget } from "@/lib/widget-loader"
import { CONTAINER } from "./section-head"
import { Shot } from "./shot"

export function Hero() {
  return (
    <section id="top" className="pb-20 md:pb-24">
      <div className={`${CONTAINER} pt-16 md:pt-28`}>
        <h1 className="text-[40px] leading-[1.06] font-[560] tracking-[-0.03em] text-emphasis sm:text-[52px] md:text-[64px] md:leading-[1.04]">
          <span className="text-gray-9">&ldquo;It&rsquo;s broken&rdquo;</span> isn&rsquo;t a bug report.
          <br />
          This is.
        </h1>

        <p className="mt-6 max-w-[520px] text-pretty text-[17px] leading-[1.55] text-gray-10">
          Brainbox is a tiny widget in your app. Users point at what broke and say what happened.
          You get a ticket you can start on, in GitHub or Azure DevOps.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Button asChild className="rounded-lg px-[18px]">
            <a href="#pricing">Get started</a>
          </Button>
          <Button variant="link" className="px-0" onClick={openWidget}>
            Try it on this page &rarr;
          </Button>
          <span className="w-full text-[13px] text-gray-10 sm:w-auto sm:border-l sm:border-default sm:pl-6">
            From $29/mo &middot; 60-day money-back guarantee
          </span>
        </div>
      </div>

      <div className={`${CONTAINER} mt-14 md:mt-16`}>
        <div className="overflow-hidden rounded-xl border border-default bg-background md:[mask-image:linear-gradient(to_bottom,#000_86%,transparent)]">
          <Shot
            name="report"
            className="hidden md:block"
            sizes="(min-width: 1200px) 1120px, calc(100vw - 80px)"
            width={1120}
            height={648}
            alt="A report in the Brainbox dashboard: “I tap Pay and nothing happens. Tried twice, the button doesn't even show a spinner.” Below it, the Pay $128.00 button the user pointed at and a screenshot of the checkout page. Beside it, the page URL, browser and viewport, and the TypeError the page logged when Pay was tapped."
          />

          {/* Phones get the two parts that matter at a readable size, not the whole page shrunk. */}
          <div className="divide-y divide-default md:hidden">
            <Shot
              name="report-phone-title"
              sizes="calc(100vw - 40px)"
              width={360}
              height={230}
              alt="A report in the Brainbox dashboard: “I tap Pay and nothing happens. Tried twice, the button doesn't even show a spinner.” Filed from shop.acme.example/checkout, status New."
            />
            <Shot
              name="report-phone-console"
              sizes="calc(100vw - 40px)"
              width={360}
              height={160}
              alt="The console error captured with it: TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')."
            />
          </div>
        </div>
      </div>
    </section>
  )
}
