import { useCurrentFrame } from "remotion";
import { ramp } from "../motion.ts";
import { font } from "../theme.ts";
import { CAPTIONS } from "../timeline.ts";

export type Format = "wide" | "square" | "vertical";

/** Burned-in captions: the film has to work on mute. On the 16:9 master
 *  they sit over the stage in a dark pill; on the social cuts they get the
 *  black band under the stage and go big. */
export function Caption({ format }: { format: Format }) {
  const frame = useCurrentFrame();
  const cap = CAPTIONS.find((c) => frame >= c.from && frame < c.to);
  if (!cap) return null;
  const inT = ramp(frame, cap.from, 10);
  const outT = 1 - ramp(frame, cap.to - 8, 8);
  const t = Math.min(inT, outT);

  if (format === "wide") {
    return (
      <div
        style={{
          position: "absolute",
          left: 72,
          bottom: 64,
          maxWidth: 900,
          padding: "16px 28px",
          borderRadius: 18,
          background: "rgba(0,0,0,0.86)",
          color: "#fff",
          fontFamily: font.sans,
          letterSpacing: "-0.02em",
          opacity: t,
          transform: `translateY(${(1 - inT) * 12}px)`,
          filter: `blur(${(1 - inT) * 6}px)`,
          zIndex: 40,
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.15 }}>{cap.text}</div>
        {cap.sub && <div style={{ marginTop: 6, fontSize: 24, fontWeight: 400, color: "rgba(255,255,255,0.7)" }}>{cap.sub}</div>}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        right: 64,
        top: format === "square" ? 800 : 1300,
        color: "#fff",
        fontFamily: font.sans,
        letterSpacing: "-0.025em",
        textAlign: "center",
        opacity: t,
        transform: `translateY(${(1 - inT) * 12}px)`,
        filter: `blur(${(1 - inT) * 6}px)`,
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.1 }}>{cap.text}</div>
      {cap.sub && <div style={{ marginTop: 14, fontSize: 32, color: "rgba(255,255,255,0.65)" }}>{cap.sub}</div>}
    </div>
  );
}
