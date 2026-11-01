import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The page's one content width, shared by the nav, every section and the footer. */
export const CONTAINER = "mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-10"

export function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 border-t border-default", className)}>
      <div className={cn(CONTAINER, "py-20 md:py-28")}>{children}</div>
    </section>
  )
}

export function SectionHead({ title, desc }: { title: ReactNode; desc?: ReactNode }) {
  return (
    <div className="max-w-[640px]">
      <h2 className="text-[30px] leading-[1.1] font-[560] tracking-[-0.025em] text-balance text-emphasis md:text-[40px]">
        {title}
      </h2>
      {desc && <p className="mt-4 text-[17px] leading-[1.55] text-pretty text-gray-10">{desc}</p>}
    </div>
  )
}
