import { Mic } from "lucide-react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop, ramp } from "../motion.ts";
import { MARK, dark, font, gh, light } from "../theme.ts";
import { Grid } from "../ui/Backdrop.tsx";
import { BRAND, Mark } from "../ui/Icons.tsx";
import { type Episode, detailsOf, titleOf } from "./episodes.ts";
import { type Beat, LAYOUT, LINE_STAGGER, ROW_STAGGER, type Rect } from "./timing.ts";

/*
 * The pieces both Reels are made of, sized for a phone held at arm's length:
 * nothing smaller than about 20px on the 1080-wide frame.
 */

export function ReelBackdrop() {
  return (
    <div style={{ position: "absolute", inset: 0, background: dark.bg }}>
      <Grid />
    </div>
  );
}

export const box = (r: Rect): React.CSSProperties => ({ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h });

/** A Slack notification from the end-user, at phone size. */
export function Message({ text, t, width, scale = 1 }: { text: string; t: number; width: number; scale?: number }) {
  const k = scale;
  return (
    <div
      style={{
        width,
        boxSizing: "border-box",
        borderRadius: 28 * k,
        background: "rgba(34,34,36,0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 30px 70px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 24 * k,
        padding: `${24 * k}px ${28 * k}px`,
        color: "#fff",
        fontFamily: font.sans,
        opacity: t,
        transform: `translateY(${(1 - t) * -40}px) scale(${0.96 + 0.04 * t})`,
      }}
    >
      <span
        style={{
          width: 76 * k,
          height: 76 * k,
          borderRadius: 20 * k,
          background: BRAND.slack.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Mark name="slack" size={40 * k} color="#fff" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 24 * k, color: dark.dim }}>
          <b style={{ color: "#fff", fontWeight: 600 }}>Maya Chen</b> · #support · now
        </span>
        <span style={{ display: "block", marginTop: 4 * k, fontSize: 42 * k, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          {text}
        </span>
      </span>
    </div>
  );
}

/** A small mono label over a block: "WHAT THEY SENT". */
export function Kicker({ text, t, color = dark.dim }: { text: string; t: number; color?: string }) {
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 26,
        letterSpacing: "0.14em",
        color,
        opacity: t,
        transform: `translateY(${(1 - t) * 10}px)`,
      }}
    >
      {text}
    </div>
  );
}

/** One caption at a time, big, in the band at the top of the safe area. */
export function ReelCaption({ beats }: { beats: readonly Beat[] }) {
  const frame = useCurrentFrame();
  const cap = beats.find((c) => frame >= c.from && frame < c.to);
  if (!cap) return null;
  const inT = ramp(frame, cap.from, 9);
  const outT = 1 - ramp(frame, cap.to - 7, 7);
  return (
    <div
      style={{
        ...box(LAYOUT.caption),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        color: "#fff",
        fontFamily: font.sans,
        letterSpacing: "-0.03em",
        opacity: Math.min(inT, outT),
        transform: `translateY(${(1 - inT) * 14}px)`,
        filter: `blur(${(1 - inT) * 6}px)`,
        zIndex: 30,
      }}
    >
      <div style={{ fontSize: 66, fontWeight: 650, lineHeight: 1.05 }}>{cap.text}</div>
      {cap.sub && <div style={{ marginTop: 14, fontSize: 34, color: "rgba(255,255,255,0.7)", lineHeight: 1.2 }}>{cap.sub}</div>}
    </div>
  );
}

/** When each block of the ticket lands, in Reel frames. */
export interface TicketTimes {
  title: number;
  image: number;
  voice: number;
  details: number;
  errors: number;
}

/**
 * The issue Brainbox opens, as a GitHub card at phone size. Same blocks, same
 * order as `renderTicket()`: title, the marked crop, the voice note, the
 * details, the console errors. `scale` shrinks it to fit a shorter slot.
 */
export function ReelTicket({ ep, at, rect, scale = 1 }: { ep: Episode; at: TicketTimes; rect: Rect; scale?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (from: number) => pop(frame, fps, from);
  // The card is on screen before its first block, so a whip brings in a
  // card, not an empty frame.
  const card = t(at.title - 16);
  const k = scale;
  const errorsWord = `${ep.consoleErrors.length} console error${ep.consoleErrors.length === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        // Sized to its content, never taller than its slot.
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        maxHeight: rect.h,
        boxSizing: "border-box",
        borderRadius: 28,
        background: gh.bg,
        border: `1px solid ${gh.line}`,
        boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)",
        padding: `${30 * k}px ${34 * k}px`,
        color: gh.text,
        fontFamily: font.sans,
        overflow: "hidden",
        opacity: card,
        transform: `translateY(${(1 - card) * 30}px)`,
      }}
    >
      <Block t={t(at.title)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 * k, fontSize: 22 * k, color: gh.dim }}>
          <Mark name="github" size={28 * k} color={gh.text} />
          <span>
            acme / <b style={{ color: gh.text, fontWeight: 600 }}>web</b> · Issues
          </span>
        </div>
        <div style={{ marginTop: 18 * k, fontSize: 42 * k, fontWeight: 500, lineHeight: 1.18, letterSpacing: "-0.015em" }}>
          {titleOf(ep)} <span style={{ color: gh.dim, fontWeight: 300 }}>#{ep.issue}</span>
        </div>
        <div style={{ marginTop: 14 * k, display: "flex", alignItems: "center", gap: 12 * k, fontSize: 21 * k, color: gh.dim }}>
          <span
            style={{
              background: gh.open,
              color: "#fff",
              borderRadius: 999,
              padding: `${4 * k}px ${16 * k}px`,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 8 * k,
            }}
          >
            <span style={{ width: 13 * k, height: 13 * k, borderRadius: 999, border: `${3 * k}px solid #fff`, boxSizing: "border-box" }} />
            Open
          </span>
          <span>
            <b style={{ color: gh.text, fontWeight: 600 }}>brainbox[bot]</b> · via Brainbox · just now
          </span>
        </div>
      </Block>

      <Block t={t(at.image)} style={{ marginTop: 24 * k }}>
        <Crop ep={ep} k={k} drawn={ramp(frame, at.image + 6, 10)} />
      </Block>

      <Block t={t(at.voice)} style={{ marginTop: 22 * k }}>
        <div style={{ fontSize: 23 * k, fontWeight: 600 }}>Voice note</div>
        <div
          style={{
            marginTop: 8 * k,
            borderLeft: `${5 * k}px solid ${gh.line}`,
            paddingLeft: 18 * k,
            color: gh.dim,
            fontSize: 27 * k,
            lineHeight: 1.35,
          }}
        >
          {ep.transcript}
        </div>
      </Block>

      <Block t={t(at.details)} style={{ marginTop: 22 * k }}>
        <div style={{ border: `1px solid ${gh.line}`, borderRadius: 10 * k, overflow: "hidden" }}>
          {detailsOf(ep).map(([label, value, code], i) => (
            <div
              key={label}
              style={{
                display: "flex",
                fontSize: 22 * k,
                borderTop: i === 0 ? undefined : `1px solid ${gh.line}`,
                opacity: t(at.details + i * ROW_STAGGER),
              }}
            >
              <span style={{ width: 170 * k, flexShrink: 0, padding: `${9 * k}px ${16 * k}px`, fontWeight: 600, background: gh.panel }}>
                {label}
              </span>
              <span
                style={{
                  padding: `${9 * k}px ${16 * k}px`,
                  fontFamily: code ? font.mono : undefined,
                  fontSize: (code ? 20 : 22) * k,
                  color: label === "Page" ? gh.link : gh.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </Block>

      {ep.consoleErrors.length > 0 && (
        <Block t={t(at.errors)} style={{ marginTop: 22 * k }}>
          <div style={{ fontSize: 23 * k, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 * k }}>
            <span style={{ display: "inline-block", transform: "rotate(90deg)", fontSize: 16 * k }}>▶</span>
            {errorsWord}
          </div>
          <div
            style={{
              marginTop: 10 * k,
              padding: `${14 * k}px ${18 * k}px`,
              background: gh.code,
              border: `1px solid ${gh.line}`,
              borderRadius: 10 * k,
              fontFamily: font.mono,
              fontSize: 19 * k,
              lineHeight: 1.5,
              color: gh.red,
            }}
          >
            {ep.consoleErrors.map((e, i) => (
              <div key={e} style={{ opacity: t(at.errors + 4 + i * LINE_STAGGER) }}>
                {e}
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}

function Block({ t, children, style }: { t: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ opacity: t, transform: `translateY(${(1 - t) * 18}px)`, ...style }}>{children}</div>;
}

/** The highlighted region as the ticket shows it: the end-user's red box
 *  round what they meant, or round the empty place where it should be. */
function Crop({ ep, k, drawn }: { ep: Episode; k: number; drawn: number }) {
  const { label, missing } = ep.marked;
  return (
    <div
      style={{
        borderRadius: 12 * k,
        border: `1px solid ${gh.line}`,
        background: light.page,
        padding: `${24 * k}px ${30 * k}px`,
        fontFamily: font.sans,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 14 * k, padding: 20 * k, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
        {missing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 * k }}>
            <Pill text="Filter" k={k} />
            <Pill text="Last 30 days" k={k} />
            <span style={{ flex: 1 }} />
            <Marked k={k} drawn={drawn}>
              <span
                style={{
                  display: "block",
                  width: 120 * k,
                  height: 44 * k,
                  borderRadius: 10 * k,
                  border: `${2 * k}px dashed ${light.faint}`,
                  boxSizing: "border-box",
                }}
                aria-label={label}
              />
            </Marked>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12 * k }}>
              <span style={{ flex: 1, height: 40 * k, border: `1px solid ${light.line}`, borderRadius: 9 * k }} />
              <span style={{ width: 110 * k, height: 40 * k, border: `1px solid ${light.line}`, borderRadius: 9 * k }} />
            </div>
            <div style={{ marginTop: 20 * k }}>
              <Marked k={k} drawn={drawn}>
                <div
                  style={{
                    height: 50 * k,
                    borderRadius: 11 * k,
                    background: light.brand,
                    color: "#fff",
                    fontSize: 21 * k,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {label}
                </div>
              </Marked>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ text, k }: { text: string; k: number }) {
  return (
    <span
      style={{
        height: 44 * k,
        padding: `0 ${16 * k}px`,
        borderRadius: 10 * k,
        border: `1px solid ${light.line}`,
        display: "inline-flex",
        alignItems: "center",
        fontSize: 19 * k,
        color: light.dim,
      }}
    >
      {text}
    </span>
  );
}

/** The red box, drawn on as the crop lands. */
function Marked({ k, drawn, children }: { k: number; drawn: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      <div
        style={{
          position: "absolute",
          inset: -11 * k,
          border: `${4 * k}px solid ${MARK}`,
          borderRadius: 10 * k,
          opacity: drawn,
          clipPath: `inset(0 ${(1 - drawn) * 100}% ${(1 - drawn) * 100}% 0)`,
        }}
      />
    </div>
  );
}

/** The last line, then the URL. No logo before this. */
export function EndTag({ from }: { from: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = ramp(frame, from, 10);
  const mark = pop(frame, fps, from + 4);
  const line = pop(frame, fps, from + 12);
  const url = ramp(frame, from + 22, 12);
  return (
    <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.94 * fade})`, zIndex: 40 }}>
      <div
        style={{
          ...box(LAYOUT.end),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.sans,
          color: dark.text,
          letterSpacing: "-0.03em",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: mark, transform: `translateY(${(1 - mark) * 18}px)` }}>
          <span
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              border: `1px solid ${dark.line}`,
              background: dark.elevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Mic size={40} />
          </span>
          <span style={{ fontSize: 84, fontWeight: 600 }}>Brainbox</span>
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 58,
            fontWeight: 550,
            lineHeight: 1.12,
            background: "linear-gradient(97deg, #ffffff 30%, rgba(255,255,255,0.55) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            opacity: line,
            transform: `translateY(${(1 - line) * 18}px)`,
          }}
        >
          Users talk.
          <br />
          Brainbox writes the ticket.
        </div>
        <div style={{ marginTop: 44, fontFamily: font.mono, fontSize: 34, color: dark.dim, opacity: url }}>brainbox.sh</div>
      </div>
    </div>
  );
}

/** Fade to black over the last frames so the loop back to frame one is
 *  dark to dark. */
export function LoopOut({ from, to }: { from: number; to: number }) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, to - from);
  if (t <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${t})`, zIndex: 50 }} />;
}
