import { memo } from "react";
import { barHeight } from "../lib/multiband.ts";

/** A row of level bars, themed with brainbox tokens rather than the shadcn ones
 *  ElevenLabs UI's `bar-visualizer` ships with. `dimFrom` greys everything at or
 *  past that index, which is how a recorded clip doubles as a playback scrubber. */
export interface BarRowProps {
  /** One 0..1 level per bar. */
  levels: readonly number[];
  /** Grey out the bars from this index on. */
  dimFrom?: number;
}

export const BarRow = memo(function BarRow({ levels, dimFrom }: BarRowProps) {
  return (
    <span
      className="flex h-8 flex-1 items-center justify-center gap-[2px] overflow-hidden"
      aria-hidden="true"
    >
      {levels.map((level, i) => (
        <Bar key={i} height={barHeight(level)} dim={dimFrom !== undefined && i >= dimFrom} />
      ))}
    </span>
  );
});

/** Memoised per bar: a talking user repaints this row ~30x a second. */
const Bar = memo(function Bar({ height, dim }: { height: number; dim: boolean }) {
  return (
    <span
      // Fixed 2px and barely rounded. Stretched-to-fill bars end up wide enough
      // that `rounded-full` turns every quiet sample into a dot.
      className="w-[2px] shrink-0 rounded-[1px] transition-[height,opacity] duration-75"
      style={{ height: `${height}%`, background: "var(--text-emphasis)", opacity: dim ? 0.25 : 1 }}
    />
  );
});
