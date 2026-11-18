import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_OUT, pop, ramp } from "../motion.ts";
import { dark, font } from "../theme.ts";
import { HOOK, MESSAGES } from "../timeline.ts";
import { BRAND, Mark } from "./Icons.tsx";

/*
 * The first three seconds have one job: stop the scroll. It is the viewer's
 * own screen: an editor open on pay.ts (the file the agent fixes at the end),
 * and the thread every founder has received sliding in over it. Then the
 * point lands in big type, and the film pushes through into what happened.
 */

const NOTE = { w: 600, h: 108, right: 56, top: 96, gap: 14 };

export function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = ramp(frame, HOOK.out, HOOK.outFrames, EASE_OUT);
  if (out >= 1) return null;
  const head = pop(frame, fps, HOOK.headline);
  const sub = pop(frame, fps, HOOK.sub);
  // When the headline lands, the desk steps back so the type owns the frame.
  const desk = 1 - 0.55 * head;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: dark.bg,
        fontFamily: font.sans,
        overflow: "hidden",
        opacity: 1 - out,
        transform: `scale(${1 + out * 0.45})`,
        filter: out > 0 ? `blur(${out * 14}px)` : undefined,
        transformOrigin: "50% 45%",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: desk, filter: `blur(${head * 3}px)` }}>
        <Editor />
        {MESSAGES.map((text, i) => (
          <Notification key={text} text={text} index={i} frame={frame} fps={fps} />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 430,
          textAlign: "center",
          opacity: head,
          transform: `scale(${1.14 - 0.14 * head})`,
          filter: `blur(${(1 - head) * 12}px)`,
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 600,
            letterSpacing: "-0.045em",
            lineHeight: 1,
            background: "linear-gradient(97deg, #ffffff 30%, rgba(255,255,255,0.55) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "0 0 0 transparent",
          }}
        >
          That’s the whole bug report.
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: font.mono,
            fontSize: 26,
            letterSpacing: "0.04em",
            color: dark.dim,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 8}px)`,
          }}
        >
          No screenshot. No steps. No errors.
        </div>
      </div>
    </div>
  );
}

/** A Slack-style desktop notification sliding in from the right edge. New
 *  ones take the top slot and push the older ones down. */
function Notification({ text, index, frame, fps }: { text: string; index: number; frame: number; fps: number }) {
  const at = HOOK.bubbles[index] ?? 0;
  const t = pop(frame, fps, at);
  if (t <= 0) return null;
  // How many later notifications have arrived (fractionally, while sliding).
  let below = 0;
  for (let j = index + 1; j < MESSAGES.length; j++) below += pop(frame, fps, HOOK.bubbles[j] ?? 0);
  const top = NOTE.top + below * (NOTE.h + NOTE.gap);
  return (
    <div
      style={{
        position: "absolute",
        right: NOTE.right,
        top,
        width: NOTE.w,
        height: NOTE.h,
        borderRadius: 20,
        background: "rgba(34,34,36,0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 24px 60px -16px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 22px",
        boxSizing: "border-box",
        color: "#fff",
        opacity: t,
        transform: `translateX(${(1 - t) * 160}px)`,
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: BRAND.slack.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Mark name="slack" size={28} color="#fff" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, color: dark.dim }}>
          <b style={{ color: "#fff", fontWeight: 600 }}>Maya Chen</b> · #support · now
        </span>
        <span style={{ display: "block", marginTop: 4, fontSize: 27, fontWeight: 500, letterSpacing: "-0.02em" }}>{text}</span>
      </span>
    </div>
  );
}

const CODE: readonly [string, string][] = [
  ["38", "export async function pay(session: Session) {"],
  ["39", "  const order = await loadOrder(session.orderId)"],
  ["40", "  const amount = order.total"],
  ["41", ""],
  ["42", "  const token = session.card.token"],
  ["43", "  const result = await gateway.charge({ amount, token })"],
  ["44", "  if (!result.ok) throw new PaymentError(result.reason)"],
  ["45", ""],
  ["46", "  await markPaid(order, result.id)"],
  ["47", "  return redirect(`/orders/${order.id}`)"],
  ["48", "}"],
];

/** The founder's editor, mid-work. The file the agent edits at the end. */
function Editor() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0b0b0c" }}>
      <div
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          fontSize: 14,
          color: dark.dim,
          fontFamily: font.sans,
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "#ff5f57" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "#febc2e" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "#28c840" }} />
        <span style={{ marginLeft: 20, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.06)", color: dark.text }}>
          pay.ts
        </span>
        <span>checkout.tsx</span>
        <span>orders.ts</span>
        <span style={{ marginLeft: "auto" }}>acme/web · main</span>
      </div>
      <div style={{ padding: "36px 0 0 60px", fontFamily: font.mono, fontSize: 24, lineHeight: 1.7, color: "#c9c9cf" }}>
        {CODE.map(([n, line]) => (
          <div key={n} style={{ display: "flex", gap: 36 }}>
            <span style={{ width: 40, textAlign: "right", color: "rgba(255,255,255,0.22)" }}>{n}</span>
            <span style={{ whiteSpace: "pre", color: line.includes("const") || line.includes("await") ? "#c9c9cf" : "#8d8d96" }}>
              {line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
