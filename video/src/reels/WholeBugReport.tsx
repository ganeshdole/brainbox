import { Camera, MessageSquarePlus, Mic, Pencil, Send, Square, Undo2, Video, X } from "lucide-react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN_OUT, EASE_OUT, pop, ramp } from "../motion.ts";
import { MARK, dark, font, light } from "../theme.ts";
import { EPISODES } from "./episodes.ts";
import { EndTag, LoopOut, Message, ReelBackdrop, ReelCaption, ReelTicket, box } from "./parts.tsx";
import {
  LAYOUT,
  LINE_STAGGER,
  MOBILE,
  PHONE_BEZEL,
  R1,
  R1_CAPTIONS,
  R1_TAPS,
  ROW_STAGGER,
  SCREEN,
  phoneScale,
  phoneZoom,
} from "./timing.ts";

/*
 * Reel 1: "That's the whole bug report." The thread every founder gets lands
 * on frame one, the point lands in big type by second two, then the same bug
 * happens on a phone with Brainbox in it: tap, circle, say it, and the
 * ticket writes itself. Ends dark so the loop back to the thread is clean.
 */

const NOTE_H = 132;
const NOTE_GAP = 18;

export function WholeBugReport({ episode }: { episode: string }) {
  const ep = EPISODES.find((e) => e.id === episode);
  const frame = useCurrentFrame();
  if (!ep) return <AbsoluteFill style={{ background: "#000" }} />;

  const turn = ramp(frame, R1.turn, 14, EASE_OUT);
  const whip = ramp(frame, R1.whip.from, R1.whip.to - R1.whip.from, EASE_IN_OUT);
  const whipBlur = Math.sin(whip * Math.PI) * 16;

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <R1Sound />
      <ReelBackdrop />

      {turn < 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 1 - turn,
            transform: `scale(${1 + turn * 0.35})`,
            filter: turn > 0 ? `blur(${turn * 12}px)` : undefined,
            transformOrigin: "50% 40%",
          }}
        >
          <Thread messages={ep.messages} />
          <Headline />
        </div>
      )}

      {frame >= R1.phoneIn && whip < 1 && (
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${-whip * 1300}px)`, filter: whipBlur ? `blur(${whipBlur}px)` : undefined }}>
          <Phone />
        </div>
      )}

      {frame >= R1.whip.from && (
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - whip) * 1300}px)`, filter: whipBlur ? `blur(${whipBlur}px)` : undefined }}>
          <ReelTicket ep={ep} at={R1.ticket} rect={LAYOUT.ticket} />
        </div>
      )}

      <ReelCaption beats={R1_CAPTIONS} />
      {frame >= R1.end && <EndTag from={R1.end} />}
      <LoopOut from={R1.fadeOut} to={R1.duration} />
    </AbsoluteFill>
  );
}

/** The thread: each new message takes the top slot and pushes the others
 *  down, the way notifications stack. */
function Thread({ messages }: { messages: readonly string[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = pop(frame, fps, R1.headline);
  return (
    <div style={{ ...box(LAYOUT.notes), opacity: 1 - 0.45 * head, filter: `blur(${head * 2}px)` }}>
      {messages.map((text, i) => {
        const t = pop(frame, fps, R1.notes[i] ?? 0);
        if (t <= 0) return null;
        let below = 0;
        for (let j = i + 1; j < messages.length; j++) below += pop(frame, fps, R1.notes[j] ?? 0);
        return (
          <div key={text} style={{ position: "absolute", left: 0, top: below * (NOTE_H + NOTE_GAP) }}>
            <Message text={text} t={t} width={LAYOUT.notes.w} />
          </div>
        );
      })}
    </div>
  );
}

function Headline() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = pop(frame, fps, R1.headline);
  const sub = pop(frame, fps, R1.sub);
  return (
    <div style={{ ...box(LAYOUT.headline), textAlign: "center", fontFamily: font.sans }}>
      <div
        style={{
          fontSize: 118,
          fontWeight: 650,
          letterSpacing: "-0.05em",
          lineHeight: 0.98,
          background: "linear-gradient(97deg, #ffffff 30%, rgba(255,255,255,0.6) 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: head,
          transform: `scale(${1.16 - 0.16 * head})`,
          filter: `blur(${(1 - head) * 12}px)`,
        }}
      >
        That’s the whole
        <br />
        bug report.
      </div>
      <div
        style={{
          marginTop: 36,
          fontFamily: font.mono,
          fontSize: 34,
          letterSpacing: "0.02em",
          color: dark.dim,
          opacity: sub,
          transform: `translateY(${(1 - sub) * 10}px)`,
        }}
      >
        No screenshot. No steps. No errors.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* The phone. Everything inside is laid out in the screen's own pixels.    */

function Phone() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = pop(frame, fps, R1.phoneIn);
  const k = phoneScale();
  const p = LAYOUT.phone;
  const view = LAYOUT.phoneView;
  const zoom = phoneZoom(frame);
  // Zoom about the phone's bottom centre, in the view's own coordinates.
  const ox = p.x + p.w / 2 - view.x;
  const oy = p.y + p.h - view.y;
  return (
    <div
      style={{
        ...box(view),
        overflow: "hidden",
        maskImage: "linear-gradient(to bottom, transparent 0, #000 28px)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 28px)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: `${ox}px ${oy}px` }}>
        <PhoneBody rise={rise} k={k} left={p.x - view.x} top={p.y - view.y} />
      </div>
    </div>
  );
}

function PhoneBody({ rise, k, left, top }: { rise: number; k: number; left: number; top: number }) {
  const p = LAYOUT.phone;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: p.w,
        height: p.h,
        boxSizing: "border-box",
        borderRadius: 72,
        background: "#1c1c1e",
        border: "2px solid #3a3a3c",
        padding: PHONE_BEZEL,
        boxShadow: "0 50px 120px -30px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.05)",
        opacity: rise,
        transform: `translateY(${(1 - rise) * 260}px)`,
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 58, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN.w, height: SCREEN.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
          <MobileCheckout />
          <MobileMarkup />
          <MobileLauncher />
          <MobileChooser />
          <MobileComposer />
          <Touches />
        </div>
      </div>
    </div>
  );
}

const T = R1.taps;

function MobileCheckout() {
  const frame = useCurrentFrame();
  const pressed = [T.payNow1, T.payNow2].some((c) => frame >= c && frame < c + 6);
  const pay = MOBILE.payNow;
  const at = (top: number): React.CSSProperties => ({ position: "absolute", top, left: 32, right: 32 });
  return (
    <div style={{ position: "absolute", inset: 0, background: light.page, fontFamily: font.sans, color: light.text, letterSpacing: "-0.011em" }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", fontSize: 15, fontWeight: 600 }}>
        <span>9:41</span>
        <span style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
          {[5, 7, 9, 11].map((h) => (
            <span key={h} style={{ width: 3, height: h, borderRadius: 1, background: light.text }} />
          ))}
          <span style={{ marginLeft: 6, width: 22, height: 11, borderRadius: 3, border: `1.5px solid ${light.text}`, boxSizing: "border-box" }} />
        </span>
      </div>
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          background: light.card,
          borderBottom: `1px solid ${light.line}`,
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: 6, background: light.text }} />
        <span style={{ fontSize: 17, fontWeight: 600 }}>Acme</span>
        <span style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: 999, background: light.line }} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          top: 112,
          height: 474,
          background: light.card,
          borderRadius: 18,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 12px 40px -16px rgba(0,0,0,0.16)",
        }}
      />
      <div style={{ ...at(130), fontSize: 26, fontWeight: 600 }}>Checkout</div>
      <div style={{ ...at(166), fontSize: 14, color: light.dim }}>Order #10482 · 2 items</div>
      <Line top={206} label="Pro plan · yearly" value="$290.00" />
      <Line top={236} label="Extra seat" value="$58.00" />
      <div style={{ ...at(268), height: 1, background: light.line }} />
      <Line top={280} label="Total" value="$348.00" bold />
      <div style={{ ...at(330), fontSize: 12, fontWeight: 600, color: light.dim, letterSpacing: "0.04em" }}>PAYMENT</div>
      <Field top={352} left={32} right={32}>
        <span style={{ fontFamily: font.mono, fontSize: 14, color: light.dim }}>•••• •••• •••• 4242</span>
      </Field>
      <Field top={410} left={32} right={150}>
        <span style={{ fontSize: 14, color: light.dim }}>12 / 28</span>
      </Field>
      <Field top={410} left={250} right={32}>
        <span style={{ fontSize: 14, color: light.dim }}>•••</span>
      </Field>
      <div
        style={{
          position: "absolute",
          left: pay.x,
          top: pay.y,
          width: pay.w,
          height: pay.h,
          borderRadius: 12,
          background: light.brand,
          color: "#fff",
          fontSize: 17,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${pressed ? 0.97 : 1})`,
          opacity: pressed ? 0.8 : 1,
        }}
      >
        Pay now
      </div>
      <div style={{ ...at(556), textAlign: "center", fontSize: 11, color: light.faint }}>Secured by Acme Pay</div>
    </div>
  );
}

function Line({ top, label, value, bold }: { top: number; label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 32,
        right: 32,
        display: "flex",
        justifyContent: "space-between",
        fontSize: 15,
        fontWeight: bold ? 600 : 400,
        color: bold ? light.text : light.dim,
      }}
    >
      <span>{label}</span>
      <span style={{ color: light.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Field({ top, left, right, children }: { top: number; left: number; right: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        right,
        height: 46,
        borderRadius: 10,
        border: `1px solid ${light.line}`,
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

function MobileLauncher() {
  const frame = useCurrentFrame();
  if (frame >= T.launcher) return null;
  const pulse = Math.sin(frame / 6) * 0.5 + 0.5;
  return (
    <div
      style={{
        position: "absolute",
        left: MOBILE.launcher.x - 26,
        top: MOBILE.launcher.y - 26,
        width: 52,
        height: 52,
        borderRadius: 999,
        background: light.brand,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 1px 2px rgba(0,0,0,0.6), 0 0 0 ${pulse * 12}px rgba(0,0,0,${0.14 * (1 - pulse)})`,
      }}
    >
      <MessageSquarePlus size={22} />
    </div>
  );
}

/** A bottom sheet, the way the widget opens on a phone. */
const sheet = (top: number, t: number): React.CSSProperties => ({
  position: "absolute",
  left: 10,
  right: 10,
  top,
  bottom: 10,
  borderRadius: 22,
  border: `1px solid ${light.line}`,
  background: light.elevated,
  boxShadow: "0 -10px 40px -12px rgba(0,0,0,0.35)",
  padding: 16,
  boxSizing: "border-box",
  fontFamily: font.sans,
  color: light.text,
  letterSpacing: "-0.011em",
  opacity: t,
  transform: `translateY(${(1 - t) * 60}px)`,
});

function SheetHead({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
      <X size={17} color={light.faint} />
    </div>
  );
}

function MobileChooser() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.launcher || frame >= T.screenshot + 5) return null;
  const t = pop(frame, fps, T.launcher);
  const chosen = frame >= T.screenshot;
  const option: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: 60,
    borderRadius: 14,
    border: `1px solid ${light.line}`,
    padding: "0 14px",
    boxSizing: "border-box",
  };
  return (
    <div style={sheet(578, t)}>
      <SheetHead title="Send feedback" />
      <div style={{ ...option, marginBottom: 8, background: chosen ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.03)" }}>
        <Camera size={21} />
        <span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>Screenshot</span>
          <span style={{ display: "block", fontSize: 12, color: light.dim }}>Mark up the page, then talk it through</span>
        </span>
      </div>
      <div style={{ ...option, background: "rgba(0,0,0,0.03)" }}>
        <Video size={21} />
        <span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>Record</span>
          <span style={{ display: "block", fontSize: 12, color: light.dim }}>Capture your actions · voice optional</span>
        </span>
      </div>
      <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: light.faint }}>
        Powered by <span style={{ fontWeight: 500 }}>Brainbox</span>
      </div>
    </div>
  );
}

function MobileMarkup() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.screenshot + 4 || frame >= T.next + 4) return null;
  const dim = ramp(frame, T.screenshot + 4, 8);
  const bar = pop(frame, fps, T.screenshot + 6);
  const draw = ramp(frame, T.boxStart, T.boxEnd - T.boxStart);
  const from = MOBILE.boxFrom;
  const to = MOBILE.boxTo;
  const drawn = frame >= T.boxEnd;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim * 0.28})` }} />
      {frame >= T.boxStart && (
        <div
          style={{
            position: "absolute",
            left: from.x,
            top: from.y,
            width: (to.x - from.x) * draw,
            height: (to.y - from.y) * draw,
            border: `3px solid ${MARK}`,
            borderRadius: 9,
            boxSizing: "border-box",
            boxShadow: `0 0 0 ${drawn ? 4 : 0}px rgba(255,77,79,0.2)`,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 736,
          width: 310,
          height: 48,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 6,
          borderRadius: 16,
          border: `1px solid ${light.line}`,
          background: light.elevated,
          boxShadow: "0 16px 48px -12px rgba(0,0,0,0.35)",
          fontFamily: font.sans,
          opacity: bar,
          transform: `translateY(${(1 - bar) * 20}px)`,
        }}
      >
        <Tool>
          <X size={16} color={light.dim} />
        </Tool>
        <Tool active>
          <Square size={16} />
        </Tool>
        <Tool>
          <Pencil size={16} />
        </Tool>
        <Tool>
          <span style={{ width: 18, height: 18, borderRadius: 999, background: MARK }} />
        </Tool>
        <Tool faded={!drawn}>
          <Undo2 size={16} color={light.dim} />
        </Tool>
        <span
          style={{
            marginLeft: "auto",
            width: 76,
            height: 36,
            borderRadius: 12,
            background: light.brand,
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: frame >= T.next ? 0.8 : 1,
          }}
        >
          Next
        </span>
      </div>
    </>
  );
}

function Tool({ children, active, faded }: { children: React.ReactNode; active?: boolean; faded?: boolean }) {
  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? light.brand : "transparent",
        color: active ? "#fff" : light.text,
        opacity: faded ? 0.3 : 1,
      }}
    >
      {children}
    </span>
  );
}

const BARS = 26;

function MobileComposer() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < T.next + 2) return null;
  const t = pop(frame, fps, T.next + 2);
  const recording = frame >= T.mic && frame < T.send - 6;
  const recorded = frame >= T.send - 6;
  const secs = Math.max(0, Math.floor((Math.min(frame, T.send - 6) - T.mic) / fps));
  const sending = frame >= T.send;
  return (
    <div style={sheet(478, t)}>
      <SheetHead title="Send feedback" />
      <div style={{ height: 100, borderRadius: 10, border: `1px solid ${light.line}`, background: light.page, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 130, top: 10, width: 96, height: 130, background: "#fff", borderRadius: 6 }}>
          <div style={{ margin: "8px 8px 0", height: 5, width: 36, background: light.line, borderRadius: 2 }} />
          <div style={{ margin: "14px 8px 0", height: 8, border: `1px solid ${light.line}`, borderRadius: 2 }} />
          <div style={{ position: "relative", margin: "12px 8px 0", height: 10, background: light.brand, borderRadius: 3 }}>
            <div style={{ position: "absolute", inset: -4, border: `1.5px solid ${MARK}`, borderRadius: 4 }} />
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          height: 60,
          borderRadius: 14,
          border: `1px solid ${recording ? light.faint : light.line}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: recording ? MARK : light.brand,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {recording ? <Square size={14} fill="#fff" /> : <Mic size={17} />}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 2, height: 30, flex: 1 }}>
          {Array.from({ length: BARS }, (_, i) => {
            const live = recording ? level(frame, i) : recorded ? 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)) : 0.12;
            return (
              <span
                key={i}
                style={{ flex: 1, height: 4 + live * 26, borderRadius: 2, background: recording || recorded ? light.text : light.line }}
              />
            );
          })}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: light.dim, width: 32, textAlign: "right" }}>
          0:{String(secs).padStart(2, "0")}
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: light.dim, display: "flex", alignItems: "center", gap: 6 }}>
        <Pencil size={12} /> Prefer to type?
      </div>
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 14,
          height: 46,
          borderRadius: 14,
          background: light.brand,
          color: "#fff",
          fontSize: 15,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: recording ? 0.4 : sending ? 0.8 : 1,
        }}
      >
        <Send size={16} /> {sending ? "Sending…" : "Send"}
      </div>
    </div>
  );
}

/** Per-band levels that look like someone speaking. */
function level(frame: number, band: number): number {
  const speech = 0.55 + 0.45 * Math.sin(frame / 3.1 + band * 0.4) * Math.sin(frame / 7.3);
  const shape = Math.exp(-Math.pow((band - 8) / 9, 2));
  return Math.max(0.05, Math.min(1, speech * (0.35 + 0.65 * shape)));
}

const RIPPLE = 14;

/** A fingertip: a ripple where each tap lands, and a dot that follows the
 *  drag while the box is drawn. */
function Touches() {
  const frame = useCurrentFrame();
  const tap = R1_TAPS.find((t) => frame >= t.frame && frame < t.frame + RIPPLE);
  const dragging = frame >= T.boxStart && frame <= T.boxEnd + 3;
  const d = ramp(frame, T.boxStart, T.boxEnd - T.boxStart);
  const from = MOBILE.boxFrom;
  const to = MOBILE.boxTo;
  return (
    <>
      {tap && (
        <div
          style={{
            position: "absolute",
            left: tap.at.x - 30,
            top: tap.at.y - 30,
            width: 60,
            height: 60,
            borderRadius: 999,
            background: "rgba(120,120,128,0.35)",
            border: "2px solid rgba(255,255,255,0.9)",
            boxSizing: "border-box",
            opacity: 1 - ramp(frame, tap.frame, RIPPLE),
            transform: `scale(${0.5 + ramp(frame, tap.frame, RIPPLE) * 0.7})`,
            zIndex: 60,
          }}
        />
      )}
      {dragging && (
        <div
          style={{
            position: "absolute",
            left: from.x + (to.x - from.x) * d - 22,
            top: from.y + (to.y - from.y) * d - 22,
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "rgba(120,120,128,0.35)",
            border: "2px solid rgba(255,255,255,0.9)",
            boxSizing: "border-box",
            zIndex: 60,
          }}
        />
      )}
    </>
  );
}

function R1Sound() {
  const sfx = (file: string, from: number, frames: number, volume: number, key: string) => (
    <Sequence key={key} from={from} durationInFrames={frames}>
      <Audio src={staticFile(`audio/${file}.mp3`)} volume={volume} />
    </Sequence>
  );
  const t = R1.ticket;
  return (
    <>
      {R1.notes.map((at, i) => sfx("notify", at, 18, 0.45, `note-${i}`))}
      {sfx("impact", R1.headline, 27, 0.8, "impact")}
      {sfx("whoosh", R1.turn, 21, 0.3, "turn")}
      {R1_TAPS.filter((tap) => tap.frame !== T.boxStart).map((tap) => sfx("click", tap.frame, 10, 0.35, `tap-${tap.frame}`))}
      {sfx("open", T.launcher, 12, 0.3, "chooser")}
      {sfx("mark", T.boxEnd, 12, 0.3, "mark")}
      {sfx("open", T.next + 2, 12, 0.3, "composer")}
      {sfx("whoosh", R1.whip.from - 2, 21, 0.4, "whip")}
      {sfx("land", t.title, 18, 0.35, "title")}
      {[t.image, t.voice, t.details, t.details + 3 * ROW_STAGGER, t.errors + 4, t.errors + 4 + LINE_STAGGER].map((at) =>
        sfx("tick", at, 6, 0.22, `tick-${at}`),
      )}
      {sfx("impact", R1.end + 12, 27, 0.5, "end")}
    </>
  );
}
