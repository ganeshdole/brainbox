import { useCurrentFrame } from "remotion";
import { cursorAt, ramp } from "../motion.ts";
import { CLICK_FRAMES } from "../timeline.ts";

const RIPPLE_FRAMES = 14;

/** A macOS-style arrow that follows the timeline, with a ripple on each click. */
export function Cursor({ color = "#000" }: { color?: string }) {
  const frame = useCurrentFrame();
  const { x, y } = cursorAt(frame);
  const click = CLICK_FRAMES.find((c) => frame >= c && frame < c + RIPPLE_FRAMES);
  const pressed = CLICK_FRAMES.some((c) => frame >= c && frame < c + 4);
  const ripple = click === undefined ? 0 : ramp(frame, click, RIPPLE_FRAMES);
  const stroke = color === "#000" ? "#fff" : "#000";

  return (
    <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 50 }}>
      {click !== undefined && (
        <div
          style={{
            position: "absolute",
            left: x - 28,
            top: y - 28,
            width: 56,
            height: 56,
            borderRadius: 999,
            border: `2px solid ${color}`,
            opacity: (1 - ripple) * 0.7,
            transform: `scale(${0.3 + ripple * 0.9})`,
          }}
        />
      )}
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x - 3,
          top: y - 2,
          transform: `scale(${pressed ? 0.9 : 1})`,
          transformOrigin: "3px 2px",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
        }}
      >
        <path
          d="M5 3l14 9-6.2 1.2L16 19.5l-2.6 1.1-3.2-6.3L5.5 18z"
          fill={color}
          stroke={stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
