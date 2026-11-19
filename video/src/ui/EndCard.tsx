import { Mic } from "lucide-react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop, ramp } from "../motion.ts";
import { dark, font } from "../theme.ts";
import { END } from "../timeline.ts";
import { type MarkName, Mark } from "./Icons.tsx";

const WORKS_WITH: { name: MarkName; label: string }[] = [
  { name: "github", label: "GitHub" },
  { name: "linear", label: "Linear" },
  { name: "slack", label: "Slack" },
  { name: "gmail", label: "Gmail" },
  { name: "claude", label: "Claude Code" },
];

/** Black, wordmark, one line, the tools, the URL. Same gradient headline as
 *  the site. */
export function EndCard() {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fade = ramp(frame, END.fadeIn, 16);
  const mark = pop(frame, fps, END.mark);
  const line = pop(frame, fps, END.line);
  const url = ramp(frame, END.url, 14);
  const k = width / 1920;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: dark.bg,
        opacity: fade,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.sans,
        color: dark.text,
        letterSpacing: "-0.03em",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18 * k,
          opacity: mark,
          transform: `translateY(${(1 - mark) * 16}px)`,
        }}
      >
        <span
          style={{
            width: 72 * k,
            height: 72 * k,
            borderRadius: 20 * k,
            border: `1px solid ${dark.line}`,
            background: dark.elevated,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Mic size={34 * k} />
        </span>
        <span style={{ fontSize: 72 * k, fontWeight: 600 }}>Brainbox</span>
      </div>
      <div
        style={{
          marginTop: 36 * k,
          fontSize: 44 * k,
          fontWeight: 500,
          textAlign: "center",
          background: "linear-gradient(97deg, #ffffff 30%, rgba(255,255,255,0.5) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: line,
          transform: `translateY(${(1 - line) * 16}px)`,
          padding: "0 40px",
        }}
      >
        Users talk. Brainbox writes the ticket.
      </div>

      <div style={{ marginTop: 48 * k, display: "flex", alignItems: "center", gap: 28 * k }}>
        {WORKS_WITH.map((w, i) => {
          const t = pop(frame, fps, END.icons + i * 4);
          return (
            <div
              key={w.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10 * k,
                opacity: t,
                transform: `translateY(${(1 - t) * 14}px)`,
              }}
            >
              <span
                style={{
                  width: 76 * k,
                  height: 76 * k,
                  borderRadius: 20 * k,
                  border: `1px solid ${dark.line}`,
                  background: "rgba(255,255,255,0.03)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Mark name={w.name} size={34 * k} />
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 13 * k, letterSpacing: "0.1em", color: dark.dim }}>
                {w.label.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 44 * k,
          fontFamily: font.mono,
          fontSize: 24 * k,
          color: dark.dim,
          letterSpacing: "0.02em",
          opacity: url,
        }}
      >
        brainbox.sh
      </div>
    </div>
  );
}
