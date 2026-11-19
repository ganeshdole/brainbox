import {
  ArrowUpRight,
  Camera,
  MessageSquarePlus,
  Mic,
  MousePointer2,
  Pencil,
  Send,
  Square,
  Trash2,
  Type,
  Undo2,
  Video,
  X,
} from "lucide-react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { pop, ramp } from "../motion.ts";
import { MARK, font, light } from "../theme.ts";
import { BOX_FROM, BOX_TO, CLICKS, LAUNCHER, SCENES } from "../timeline.ts";

/*
 * The widget, in its light theme, drawn from the real components in
 * widget/src/components: same copy, same layout, same radii. Mirrored by
 * hand so a film frame can be asked for at any time without the engine
 * needing a microphone or a rasteriser.
 */

const panel = {
  position: "absolute" as const,
  right: 48,
  bottom: 48,
  borderRadius: 16,
  border: `1px solid ${light.line}`,
  background: light.elevated,
  boxShadow: "0 16px 48px -12px rgba(0,0,0,0.35)",
  padding: 16,
  boxSizing: "border-box" as const,
  fontFamily: font.sans,
  color: light.text,
  letterSpacing: "-0.011em",
  transformOrigin: "100% 100%",
};

const option = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: 12,
  border: `1px solid ${light.line}`,
  background: "rgba(0,0,0,0.03)",
  padding: 12,
};

function Head({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
      <X size={16} color={light.faint} />
    </div>
  );
}

/** The floating trigger, bottom-right, exactly the size the widget renders. */
export function Launcher() {
  const frame = useCurrentFrame();
  const open = frame >= CLICKS.launcher;
  const pulse = frame < CLICKS.launcher ? Math.sin(frame / 7) * 0.5 + 0.5 : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: LAUNCHER.x - 24,
        top: LAUNCHER.y - 24,
        width: 48,
        height: 48,
        borderRadius: 999,
        background: light.brand,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.6), 0 0 0 ${pulse * 10}px rgba(0,0,0,${0.12 * (1 - pulse)})`,
        opacity: open ? 0 : 1,
      }}
    >
      <MessageSquarePlus size={20} />
    </div>
  );
}

/** "Send feedback": Screenshot or Record. */
export function Chooser() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const trigger = SCENES.find((s) => s.id === "trigger");
  if (!trigger || frame < CLICKS.launcher || frame >= trigger.to) return null;
  const t = pop(frame, fps, CLICKS.launcher);
  const chosen = frame >= CLICKS.screenshot;
  return (
    <div style={{ ...panel, width: 288, transform: `scale(${0.92 + t * 0.08})`, opacity: t }}>
      <Head title="Send feedback" />
      <div style={{ ...option, marginBottom: 8, background: chosen ? "rgba(0,0,0,0.07)" : option.background }}>
        <Camera size={20} />
        <span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>Screenshot</span>
          <span style={{ display: "block", fontSize: 12, color: light.dim }}>Mark up the page, then talk it through</span>
        </span>
      </div>
      <div style={option}>
        <Video size={20} />
        <span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>Record</span>
          <span style={{ display: "block", fontSize: 12, color: light.dim }}>Capture your actions · voice optional</span>
        </span>
      </div>
      <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: light.faint }}>
        Powered by <span style={{ fontWeight: 500 }}>Brainbox</span>
      </div>
    </div>
  );
}

/** The frozen page, the box being drawn, and the toolbar underneath. */
export function Markup() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const markup = SCENES.find((s) => s.id === "markup");
  if (!markup || frame < markup.from || frame >= markup.to) return null;

  const dim = ramp(frame, markup.from, 10);
  const bar = pop(frame, fps, markup.from + 4);
  const drawing = ramp(frame, CLICKS.boxStart, CLICKS.boxEnd - CLICKS.boxStart);
  const w = (BOX_TO.x - BOX_FROM.x) * drawing;
  const h = (BOX_TO.y - BOX_FROM.y) * drawing;
  const drawn = frame >= CLICKS.boxEnd;

  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim * 0.28})` }} />
      {frame >= CLICKS.boxStart && (
        <div
          style={{
            position: "absolute",
            left: BOX_FROM.x,
            top: BOX_FROM.y,
            width: w,
            height: h,
            border: `3px solid ${MARK}`,
            borderRadius: 8,
            boxShadow: `0 0 0 ${drawn ? 4 : 0}px rgba(255,77,79,0.18)`,
            boxSizing: "border-box",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 32,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${(1 - bar) * 24}px)`,
          opacity: bar,
        }}
      >
        <Toolbar canUndo={drawn} next={frame >= CLICKS.next} />
      </div>
    </>
  );
}

function Toolbar({ canUndo, next }: { canUndo: boolean; next: boolean }) {
  const tools = [MousePointer2, Square, ArrowUpRight, Pencil, Type];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 16,
        border: `1px solid ${light.line}`,
        background: light.elevated,
        padding: 6,
        boxShadow: "0 16px 48px -12px rgba(0,0,0,0.35)",
        fontFamily: font.sans,
      }}
    >
      <Icon>
        <X size={16} color={light.dim} />
      </Icon>
      <Divider />
      {tools.map((T, i) => (
        <Icon key={i} active={i === 1}>
          <T size={16} />
        </Icon>
      ))}
      <Divider />
      <Icon>
        <span style={{ width: 20, height: 20, borderRadius: 999, background: MARK, border: `1px solid ${light.line}` }} />
      </Icon>
      <Icon faded={!canUndo}>
        <Undo2 size={16} color={light.dim} />
      </Icon>
      <Icon faded>
        <Trash2 size={16} color={light.dim} />
      </Icon>
      <Divider />
      <div
        style={{
          height: 36,
          padding: "0 16px",
          borderRadius: 12,
          background: light.brand,
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.6)",
          opacity: next ? 0.8 : 1,
        }}
      >
        Next
      </div>
    </div>
  );
}

const Divider = () => <span style={{ margin: "0 4px", width: 1, height: 24, background: light.line }} />;

function Icon({ children, active, faded }: { children: React.ReactNode; active?: boolean; faded?: boolean }) {
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

const BARS = 32;

/** The composer: screenshot thumbnail, then the mic as the one thing to press. */
export function Composer() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const voice = SCENES.find((s) => s.id === "voice");
  if (!voice || frame < voice.from || frame >= voice.to) return null;

  const t = pop(frame, fps, voice.from);
  const recording = frame >= CLICKS.mic && frame < CLICKS.micStop;
  const recorded = frame >= CLICKS.micStop;
  const secs = Math.max(0, Math.floor((Math.min(frame, CLICKS.micStop) - CLICKS.mic) / fps));
  const sending = frame >= CLICKS.send;

  return (
    <div style={{ ...panel, width: 384, transform: `scale(${0.92 + t * 0.08})`, opacity: t }}>
      <Head title="Send feedback" />
      <Thumbnail />
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${recording ? light.faint : light.line}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: recording ? MARK : light.brand,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {recording ? <Square size={14} fill="#fff" /> : <Mic size={16} />}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 2, height: 28, flex: 1 }}>
          {Array.from({ length: BARS }, (_, i) => {
            const live = recording ? level(frame, i) : recorded ? 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)) : 0.12;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 4 + live * 24,
                  borderRadius: 2,
                  background: recording || recorded ? light.text : light.line,
                }}
              />
            );
          })}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: light.dim, width: 34, textAlign: "right" }}>
          0:{String(secs).padStart(2, "0")}
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: light.dim, display: "flex", alignItems: "center", gap: 6 }}>
        <Pencil size={12} /> Prefer to type?
      </div>
      <div
        style={{
          marginTop: 12,
          height: 38,
          borderRadius: 12,
          background: light.brand,
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: recording ? 0.4 : sending ? 0.8 : 1,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        <Send size={16} /> {sending ? "Sending…" : "Send"}
      </div>
    </div>
  );
}

/** Per-band levels that look like someone speaking: a slow envelope with
 *  syllable-rate ripples, louder in the low-mid bands. */
function level(frame: number, band: number): number {
  const speech = 0.55 + 0.45 * Math.sin(frame / 3.1 + band * 0.4) * Math.sin(frame / 7.3);
  const shape = Math.exp(-Math.pow((band - 9) / 10, 2));
  return Math.max(0.05, Math.min(1, speech * (0.35 + 0.65 * shape)));
}

/** The captured screenshot, mark baked on, as the composer previews it. */
function Thumbnail() {
  return (
    <div
      style={{
        marginBottom: 12,
        height: 150,
        borderRadius: 8,
        border: `1px solid ${light.line}`,
        background: light.page,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: 118, top: 14, width: 116, height: 170, background: "#fff", borderRadius: 5 }}>
        <div style={{ margin: "8px 8px 0", height: 5, width: 40, background: light.line, borderRadius: 2 }} />
        <div style={{ margin: "6px 8px 0", height: 4, width: 70, background: light.page, borderRadius: 2 }} />
        <div style={{ margin: "16px 8px 0", height: 9, border: `1px solid ${light.line}`, borderRadius: 2 }} />
        <div style={{ margin: "6px 8px 0", height: 9, border: `1px solid ${light.line}`, borderRadius: 2 }} />
        <div style={{ position: "relative", margin: "14px 8px 0", height: 11, background: light.brand, borderRadius: 3 }}>
          <div style={{ position: "absolute", inset: -4, border: `1.5px solid ${MARK}`, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}
