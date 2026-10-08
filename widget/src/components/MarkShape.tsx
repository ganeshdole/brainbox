import { memo } from "react";
import {
  arrowHead,
  penPath,
  FONT_STACK,
  STROKE_WIDTH,
  TEXT_HALO,
  TEXT_HALO_WIDTH,
  TEXT_SIZE,
  type Mark,
} from "@brainbox/core";

/** One mark as SVG. Shared by the markup step and the in-recording overlay so
 *  a box drawn in one looks identical in the other - and matches the bake,
 *  which draws the same geometry onto a canvas. */
export const MarkShape = memo(function MarkShape({ mark }: { mark: Mark }) {
  switch (mark.kind) {
    case "box":
      return (
        <rect
          x={mark.x}
          y={mark.y}
          width={mark.width}
          height={mark.height}
          fill="none"
          stroke={mark.color}
          strokeWidth={STROKE_WIDTH}
        />
      );

    case "arrow": {
      const [tip, left, right] = arrowHead(mark);
      return (
        <g>
          <line
            x1={mark.x1}
            y1={mark.y1}
            x2={mark.x2}
            y2={mark.y2}
            stroke={mark.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          <polygon
            points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
            fill={mark.color}
          />
        </g>
      );
    }

    case "pen":
      return (
        <path
          d={penPath(mark)}
          fill="none"
          stroke={mark.color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    case "text":
      return (
        <text
          x={mark.x}
          y={mark.y}
          fill={mark.color}
          stroke={TEXT_HALO}
          strokeWidth={TEXT_HALO_WIDTH}
          paintOrder="stroke"
          fontFamily={FONT_STACK}
          fontSize={TEXT_SIZE}
          fontWeight={700}
        >
          {mark.text}
        </text>
      );
  }
});

/** The floating input a text mark is typed into, positioned so the text sits
 *  where the baked glyphs will land. */
export function MarkTextInput({
  at,
  color,
  onChange,
  onCommit,
  onCancel,
}: {
  at: { x: number; y: number; value: string };
  color: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={at.value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      placeholder="Type a note"
      className="absolute bg-transparent font-bold outline-none placeholder:font-normal placeholder:opacity-60"
      style={{
        left: at.x,
        top: at.y - TEXT_SIZE,
        color,
        // same stack the mark and the bake use, so the glyphs don't reflow the
        // moment the input is swapped for the committed text
        fontFamily: FONT_STACK,
        fontSize: TEXT_SIZE,
        // mirrors the halo the mark gets once rendered
        textShadow: `0 0 3px ${TEXT_HALO}, 0 0 3px ${TEXT_HALO}`,
        minWidth: 160,
      }}
    />
  );
}
