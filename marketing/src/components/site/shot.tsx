import { cn } from "@/lib/utils"
import { shotSources } from "@/lib/shots"

const FILES = import.meta.glob<string>("../../assets/shots/*.{avif,webp}", {
  eager: true,
  import: "default",
})

interface ShotProps {
  name: string
  alt: string
  /** Intrinsic size in CSS pixels, so the layout holds before the image loads. */
  width: number
  height: number
  sizes: string
  className?: string
}

/** One product screenshot, AVIF with a WebP fallback, at the width the layout needs. */
export function Shot({ name, alt, width, height, sizes, className }: ShotProps) {
  const sources = shotSources(FILES, name)
  return (
    <picture className={cn("block", className)}>
      <source type="image/avif" srcSet={sources.avif} sizes={sizes} />
      <img
        src={sources.fallback}
        srcSet={sources.webp}
        sizes={sizes}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        alt={alt}
        className="block h-auto w-full"
      />
    </picture>
  )
}
