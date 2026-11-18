import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop, ramp } from "../motion.ts";
import { dark, font, gh } from "../theme.ts";
import { AGENT, AGENT_COMMAND, WHIP2 } from "../timeline.ts";
import { Mark } from "./Icons.tsx";

/*
 * Act five: the ticket has everything an agent needs, so an agent takes it.
 * A terminal runs Claude Code against issue #482; it reads the report, finds
 * the line, edits it, runs the tests and opens a pull request that closes
 * the issue. This is where the product is going, not a feature that ships
 * today - the recap flags it.
 */

type Line =
  | { kind: "step"; text: string; dim?: string }
  | { kind: "minus"; text: string }
  | { kind: "plus"; text: string };

const LINES: readonly Line[] = [
  { kind: "step", text: "Read issue #482", dim: "Pay now does nothing on the last checkout step" },
  { kind: "step", text: "Attached", dim: "screenshot · voice transcript · 2 console errors · Safari 18.4 · en-GB" },
  { kind: "step", text: "Found it", dim: "src/checkout/pay.ts:42 reads session.card.token before the card is saved" },
  { kind: "step", text: "Edit src/checkout/pay.ts" },
  { kind: "minus", text: "const token = session.card.token" },
  { kind: "plus", text: "const card = await ensureCard(session)" },
  { kind: "plus", text: "const token = card.token" },
  { kind: "step", text: "Tests", dim: "48 passed" },
  { kind: "step", text: "Opened PR #483", dim: "Fix Pay now on the last checkout step · closes #482" },
];

export function Agent() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < WHIP2.from) return null;
  const win = pop(frame, fps, AGENT.window);
  const typed = Math.round(ramp(frame, AGENT.typeFrom, AGENT.typeTo - AGENT.typeFrom) * AGENT_COMMAND.length);
  const caretOn = frame < AGENT.typeTo + 8 && Math.floor(frame / 8) % 2 === 0;

  return (
    <div style={{ position: "absolute", inset: 0, background: dark.bg, fontFamily: font.sans }}>
      <div
        style={{
          position: "absolute",
          left: 240,
          top: 150,
          width: 1440,
          height: 780,
          borderRadius: 18,
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)",
          overflow: "hidden",
          opacity: win,
          transform: `translateY(${(1 - win) * 24}px) scale(${0.97 + 0.03 * win})`,
          transformOrigin: "50% 60%",
        }}
      >
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 18px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 14,
            color: dark.dim,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f57" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#febc2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#28c840" }} />
          <span style={{ marginLeft: "auto", marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <Mark name="claude" size={14} color="#D97757" /> claude — acme/web
          </span>
        </div>

        <div style={{ padding: "26px 34px", fontFamily: font.mono, fontSize: 21, lineHeight: 1.65, color: dark.text }}>
          <div>
            <span style={{ color: dark.dim }}>$ </span>
            {AGENT_COMMAND.slice(0, typed)}
            <span style={{ opacity: caretOn ? 1 : 0, color: dark.text }}>▍</span>
          </div>
          <div style={{ height: 14 }} />
          {LINES.map((line, i) => (
            <Row key={i} line={line} t={pop(frame, fps, AGENT.lines[i] ?? 0)} />
          ))}
        </div>
      </div>

      <PullRequest frame={frame} fps={fps} />
    </div>
  );
}

function Row({ line, t }: { line: Line; t: number }) {
  if (t <= 0) return <div style={{ height: 35 }} />;
  const style: React.CSSProperties = {
    opacity: t,
    transform: `translateX(${(1 - t) * -10}px)`,
    whiteSpace: "nowrap",
  };
  if (line.kind === "step") {
    return (
      <div style={style}>
        <span style={{ color: "#D97757" }}>● </span>
        {line.text}
        {line.dim && <span style={{ color: dark.dim }}>  {line.dim}</span>}
      </div>
    );
  }
  const plus = line.kind === "plus";
  return (
    <div
      style={{
        ...style,
        margin: "0 0 0 28px",
        padding: "0 14px",
        background: plus ? "rgba(63,185,80,0.14)" : "rgba(248,81,73,0.14)",
        color: plus ? "#7ee787" : "#ff7b72",
        borderRadius: 6,
        width: "fit-content",
      }}
    >
      {plus ? "+ " : "- "}
      {line.text}
    </div>
  );
}

/** The payoff: a pull request, checks green, the issue closed. */
function PullRequest({ frame, fps }: { frame: number; fps: number }) {
  const t = pop(frame, fps, AGENT.prCard);
  if (t <= 0) return null;
  const closed = pop(frame, fps, AGENT.closed);
  return (
    <div
      style={{
        position: "absolute",
        left: 1040,
        top: 760,
        width: 700,
        borderRadius: 18,
        background: gh.panel,
        border: `1px solid ${gh.line}`,
        boxShadow: "0 32px 80px -16px rgba(0,0,0,0.8)",
        padding: "18px 22px",
        boxSizing: "border-box",
        color: gh.text,
        opacity: t,
        transform: `translateY(${(1 - t) * 30}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: gh.dim }}>
        <Mark name="github" size={18} color={gh.text} />
        acme/web · Pull request
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "#3fb950" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#3fb950" }} /> All checks passed
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }}>
        Fix Pay now on the last checkout step <span style={{ color: gh.dim, fontWeight: 400 }}>#483</span>
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: gh.dim }}>
        <span>Closes</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            padding: "3px 10px",
            background: closed > 0.5 ? "#8957e5" : gh.open,
            color: "#fff",
            fontWeight: 500,
            transform: `scale(${1 + 0.06 * Math.sin(closed * Math.PI)})`,
          }}
        >
          #482 · {closed > 0.5 ? "Closed" : "Open"}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Mark name="claude" size={14} color="#D97757" /> opened by Claude Code
        </span>
      </div>
    </div>
  );
}
