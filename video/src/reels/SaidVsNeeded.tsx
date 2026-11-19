import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_IN_OUT, pop, ramp } from "../motion.ts";
import { EPISODES } from "./episodes.ts";
import { EndTag, Kicker, LoopOut, Message, ReelBackdrop, ReelTicket, box } from "./parts.tsx";
import { LAYOUT, LINE_STAGGER, R2, ROW_STAGGER } from "./timing.ts";

/*
 * Reel 2: "What they sent vs what you needed." The one line an end-user
 * really sends sits alone in the frame long enough to wince at, then moves
 * up and the ticket for the same bug builds underneath it. The contrast is
 * the whole Reel; the episode only changes the words.
 */

export function SaidVsNeeded({ episode }: { episode: string }) {
  const ep = EPISODES.find((e) => e.id === episode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!ep) return <AbsoluteFill style={{ background: "#000" }} />;

  const said = pop(frame, fps, R2.said);
  const kicker = ramp(frame, R2.kicker, 8);
  const m = ramp(frame, R2.move, R2.moveFrames, EASE_IN_OUT);
  const lerp = (a: number, b: number) => a + (b - a) * m;
  const alone = LAYOUT.saidAlone;
  const top = LAYOUT.saidTop;
  // Alone, the message is centred in its slot and large; at the top it is
  // pinned to the slot's top edge and smaller.
  const big = 1.3;
  const small = 0.84;
  const scale = lerp(big, small);
  const y = lerp(alone.y, top.y);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ReelSound />
      <ReelBackdrop />

      <div style={{ position: "absolute", left: alone.x, width: alone.w, top: y }}>
        <Kicker text="WHAT THEY SENT" t={kicker} />
        <div style={{ marginTop: lerp(26, 14) }}>
          <Message text={ep.said} t={said} width={alone.w} scale={scale} />
        </div>
      </div>

      <div style={box(LAYOUT.neededKicker)}>
        <Kicker text="WHAT YOU NEEDED" t={ramp(frame, R2.needed, 8)} color="#3fb950" />
      </div>

      {frame >= R2.ticket.title - 16 && <ReelTicket ep={ep} at={R2.ticket} rect={LAYOUT.ticketLow} scale={0.94} />}

      {frame >= R2.end && <EndTag from={R2.end} />}
      <LoopOut from={R2.fadeOut} to={R2.duration} />
    </AbsoluteFill>
  );
}

/** One sound per motion: the message arriving, each block landing. */
function ReelSound() {
  const sfx = (file: string, from: number, frames: number, volume: number, key: string) => (
    <Sequence key={key} from={from} durationInFrames={frames}>
      <Audio src={staticFile(`audio/${file}.mp3`)} volume={volume} />
    </Sequence>
  );
  const t = R2.ticket;
  return (
    <>
      {sfx("notify", R2.said, 18, 0.5, "said")}
      {sfx("whoosh", R2.move - 4, 21, 0.25, "move")}
      {sfx("land", t.title, 18, 0.35, "title")}
      {sfx("mark", t.image + 6, 12, 0.3, "mark")}
      {[t.voice, t.details, t.details + 3 * ROW_STAGGER, t.errors + 4, t.errors + 4 + LINE_STAGGER].map((at) =>
        sfx("tick", at, 6, 0.24, `tick-${at}`),
      )}
      {sfx("impact", R2.end + 12, 27, 0.55, "end")}
    </>
  );
}
