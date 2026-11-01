import { Button } from "@/components/ui/button"
import { CONTAINER } from "./section-head"

export function NotFound() {
  return (
    <section className={`${CONTAINER} pt-24 pb-32 md:pt-32`}>
      <p className="font-mono text-[12px] tracking-[0.12em] text-gray-10 uppercase">404</p>
      <h1 className="mt-4 text-[36px] leading-[1.08] font-[560] tracking-[-0.03em] text-emphasis md:text-[52px]">
        There&rsquo;s no page here.
      </h1>
      <p className="mt-5 max-w-[520px] text-[17px] leading-[1.55] text-gray-10">
        If a link brought you here, the widget in the corner will tell us about it.
      </p>
      <Button asChild className="mt-8 rounded-lg px-[18px]">
        <a href="/">Go to the home page</a>
      </Button>
    </section>
  )
}
