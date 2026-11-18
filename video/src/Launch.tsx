import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN_OUT, EASE_OUT, ramp } from "./motion.ts";
import {
  AGENT,
  AUDIO,
  CLICK_FRAMES,
  CLICKS,
  DELIVERED,
  DELIVERED_STAGGER,
  DEST,
  HEIGHT,
  HOOK,
  PANEL_OPENS,
  SCENES,
  TICKET,
  WHIP,
  WHIP2,
  WIDTH,
  bedVolume,
  s,
} from "./timeline.ts";
import { Agent } from "./ui/Agent.tsx";
import { Caption, type Format } from "./ui/Caption.tsx";
import { Checkout } from "./ui/Checkout.tsx";
import { Cursor } from "./ui/Cursor.tsx";
import { Destinations } from "./ui/Destinations.tsx";
import { EndCard } from "./ui/EndCard.tsx";
import { GithubIssue } from "./ui/GithubIssue.tsx";
import { Hook } from "./ui/Hook.tsx";
import { Chooser, Composer, Launcher, Markup } from "./ui/Widget.tsx";

/** Where the camera looks: a point on the 1920×1080 stage and a zoom. */
interface CameraKey {
  frame: number;
  scale: number;
  cx: number;
  cy: number;
}

const STILL: CameraKey = { frame: 0, scale: 1, cx: WIDTH / 2, cy: HEIGHT / 2 };

/* The camera does every transition: push into the action, never cut. */
const HOST_CAMERA: readonly CameraKey[] = [
  { frame: s(3.2), scale: 1, cx: 960, cy: 540 },
  { frame: s(4.6), scale: 1.14, cx: 960, cy: 560 },
  { frame: s(5.6), scale: 1.14, cx: 960, cy: 560 },
  { frame: s(6.3), scale: 1.45, cx: 1500, cy: 820 },
  { frame: s(8.0), scale: 1.45, cx: 1500, cy: 820 },
  { frame: s(8.7), scale: 1.4, cx: 960, cy: 720 },
  { frame: s(10.2), scale: 1.4, cx: 960, cy: 720 },
  { frame: s(11.0), scale: 1.45, cx: 1480, cy: 820 },
];

const TICKET_CAMERA: readonly CameraKey[] = [
  { frame: TICKET.page, scale: 1, cx: 960, cy: 520 },
  { frame: TICKET.footer, scale: 1, cx: 960, cy: 556 },
  { frame: TICKET.zoomIn, scale: 1, cx: 960, cy: 556 },
  { frame: TICKET.zoomIn + 22, scale: 1.6, cx: 820, cy: 743 },
  { frame: TICKET.zoomOut, scale: 1.6, cx: 820, cy: 743 },
  { frame: TICKET.zoomOut + 18, scale: 1.05, cx: 960, cy: 556 },
];

function cameraAt(frame: number, keys: readonly CameraKey[]): CameraKey {
  const first = keys[0];
  if (!first) return STILL;
  if (frame <= first.frame) return clampToStage(first);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (frame <= b.frame) {
      const t = ramp(frame, a.frame, b.frame - a.frame, EASE_IN_OUT);
      return clampToStage({
        frame,
        scale: a.scale + (b.scale - a.scale) * t,
        cx: a.cx + (b.cx - a.cx) * t,
        cy: a.cy + (b.cy - a.cy) * t,
      });
    }
  }
  return clampToStage(keys[keys.length - 1] ?? first);
}

function withScale(c: CameraKey, k: number): CameraKey {
  return clampToStage({ ...c, scale: c.scale * k });
}

/** The camera never looks past the edge of the stage, so a push into a
 *  corner shows the corner rather than black beside it. */
export function clampToStage(c: CameraKey): CameraKey {
  const halfW = WIDTH / 2 / c.scale;
  const halfH = HEIGHT / 2 / c.scale;
  return {
    ...c,
    cx: Math.min(Math.max(c.cx, halfW), WIDTH - halfW),
    cy: Math.min(Math.max(c.cy, halfH), HEIGHT - halfH),
  };
}

/** A 1920×1080 stage seen through a camera, plus an optional whip offset. */
function Stage({
  camera,
  shiftX = 0,
  blur = 0,
  opacity = 1,
  children,
}: {
  camera: CameraKey;
  shiftX?: number;
  blur?: number;
  opacity?: number;
  children: React.ReactNode;
}) {
  const { scale, cx, cy } = camera;
  const tx = WIDTH / 2 - cx * scale + shiftX;
  const ty = HEIGHT / 2 - cy * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: WIDTH,
        height: HEIGHT,
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: "0 0",
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        opacity,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

/** A whip between two stages: 0 before, 1 after, with blur and a depth dip
 *  through the middle. */
function whipAt(frame: number, w: { from: number; to: number }) {
  const t = ramp(frame, w.from, w.to - w.from, EASE_IN_OUT);
  const mid = Math.sin(t * Math.PI);
  return { t, outShift: -t * (WIDTH + 400), inShift: (1 - t) * (WIDTH + 400), blur: mid * 18, dip: 1 - mid * 0.06 };
}

/** The film on a 1920×1080 canvas. The social cuts scale and reframe this. */
function Film() {
  const frame = useCurrentFrame();
  const hold = SCENES.find((sc) => sc.id === "hold");
  const end = SCENES.find((sc) => sc.id === "end");

  const w1 = whipAt(frame, WHIP);
  const w2 = whipAt(frame, WHIP2);
  // A slow breath on the host camera: nothing in the film sits perfectly still.
  const breath = 1 + 0.008 * Math.sin(frame / 38);
  // The hook pushes through into the checkout: it grows and fades, the
  // checkout settles in from slightly large.
  const hookIn = ramp(frame, HOOK.out, HOOK.outFrames, EASE_OUT);
  // The GitHub page dissolves into the first destination.
  const toDest = ramp(frame, DEST.from, DEST.xfade);

  const showHook = frame < HOOK.out + HOOK.outFrames;
  const showHost = frame >= HOOK.out && frame < WHIP.to;
  const showTicket = frame >= WHIP.from && toDest < 1;
  const showDest = frame >= DEST.from && frame < WHIP2.to;
  const showAgent = frame >= WHIP2.from && (!end || frame < end.to);
  const dimT = hold ? ramp(frame, hold.from + 6, 16) - ramp(frame, TICKET.zoomOut, 14, EASE_OUT) : 0;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
      {showHook && <Hook />}
      {showHost && (
        <Stage
          camera={withScale(cameraAt(frame, HOST_CAMERA), breath * w1.dip * (1 + 0.08 * (1 - hookIn)))}
          shiftX={w1.outShift}
          blur={w1.blur}
          opacity={hookIn}
        >
          <Checkout />
          <Markup />
          <Launcher />
          <Chooser />
          <Composer />
          <Cursor />
        </Stage>
      )}
      {showTicket && (
        <Stage camera={withScale(cameraAt(frame, TICKET_CAMERA), w1.dip)} shiftX={w1.inShift} blur={w1.blur} opacity={1 - toDest}>
          <GithubIssue />
          {/* Everything but the console errors falls back while the camera holds. */}
          <div
            style={{
              position: "absolute",
              left: 206,
              top: 812,
              width: 1188,
              height: 150,
              borderRadius: 8,
              boxShadow: `0 0 0 4000px rgba(0,0,0,${0.62 * Math.max(0, dimT)})`,
              pointerEvents: "none",
            }}
          />
        </Stage>
      )}
      {showDest && (
        <Stage camera={withScale(STILL, w2.dip)} shiftX={w2.outShift} blur={w2.blur}>
          <Destinations />
        </Stage>
      )}
      {showAgent && (
        <Stage camera={withScale(STILL, w2.dip)} shiftX={w2.inShift} blur={w2.blur}>
          <Agent />
        </Stage>
      )}
      {end && frame >= end.from && <EndCard />}
    </div>
  );
}

/** Sound confirms, never narrates. A quiet bed under everything, ducked
 *  under the one voice; one sound per motion it confirms. */
function Sound() {
  const blocks = [TICKET.image, TICKET.voice, TICKET.table, TICKET.errors];
  const sfx = (file: string, from: number, frames: number, volume: number, key: string) => (
    <Sequence key={key} from={from} durationInFrames={frames}>
      <Audio src={staticFile(`audio/${file}.mp3`)} volume={volume} />
    </Sequence>
  );
  return (
    <>
      <Audio src={staticFile("audio/bed.mp3")} loop volume={(f) => bedVolume(f)} />
      {HOOK.bubbles.map((f, i) => sfx("notify", f, 18, 0.45, `notify-${i}`))}
      {sfx("impact", AUDIO.impact, 27, 0.8, "impact")}
      {CLICK_FRAMES.filter((f) => f !== CLICKS.boxStart).map((f) => sfx("click", f, 10, 0.35, `click-${f}`))}
      {PANEL_OPENS.map((f) => sfx("open", f, 12, 0.3, `open-${f}`))}
      {sfx("mark", CLICKS.boxEnd, 12, 0.3, "mark")}
      {sfx("voice", AUDIO.voice, AUDIO.voiceFrames, 0.85, "voice")}
      {sfx("whoosh", AUDIO.whoosh, s(0.7), 0.4, "whoosh")}
      {sfx("land", AUDIO.land, s(0.6), 0.35, "land")}
      {blocks.map((f) => sfx("tick", f, 6, 0.22, `tick-${f}`))}
      {[DEST.linear, DEST.slack, DEST.gmail].map((f) => sfx("tick", f + 6, 6, 0.28, `dest-${f}`))}
      {DELIVERED.map((name, i) => sfx("tick", DEST.row + 16 + i * DELIVERED_STAGGER, 6, 0.3, `delivered-${name}`))}
      {sfx("whoosh", AUDIO.whoosh2, s(0.7), 0.4, "whoosh2")}
      {sfx("open", AUDIO.terminal, 12, 0.3, "terminal")}
      {AGENT.lines.map((f, i) => sfx("tick", f, 6, 0.16, `line-${i}`))}
      {sfx("land", AUDIO.pr, s(0.6), 0.35, "pr")}
      {sfx("pop", AGENT.closed, 6, 0.35, "closed")}
    </>
  );
}

export function Launch({ format }: { format: Format }) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const end = SCENES.find((sc) => sc.id === "end");
  const ending = end ? frame >= end.from : false;

  if (format === "wide") {
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <Sound />
        <Film />
        <Caption format="wide" />
      </AbsoluteFill>
    );
  }

  // Square and vertical: the stage fits the width, captions live in the band
  // below it, and the end card takes the whole frame.
  const k = width / WIDTH;
  const stageTop = format === "square" ? 140 : 500;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sound />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: stageTop,
          width: WIDTH,
          height: HEIGHT,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
          borderRadius: 24 / k,
          overflow: "hidden",
          opacity: ending ? 0 : 1,
        }}
      >
        <Film />
      </div>
      <Caption format={format} />
      {ending && (
        <div style={{ position: "absolute", left: 0, top: 0, width, height }}>
          <EndCard />
        </div>
      )}
    </AbsoluteFill>
  );
}
