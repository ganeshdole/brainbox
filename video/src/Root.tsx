import { Composition } from "remotion";
import { Launch } from "./Launch.tsx";
import { EPISODES } from "./reels/episodes.ts";
import { SaidVsNeeded } from "./reels/SaidVsNeeded.tsx";
import { R1, R2, REEL_FPS, REEL_H, REEL_W } from "./reels/timing.ts";
import { WholeBugReport } from "./reels/WholeBugReport.tsx";
import { DURATION, FPS, HEIGHT, WIDTH } from "./timeline.ts";

/** One film, three frames: the 16:9 master, and the square and vertical
 *  cuts for X, LinkedIn and Shorts. Then the Reels, built for the phone:
 *  one composition per Reel per episode. */
export function Root() {
  return (
    <>
      <Composition
        id="Launch"
        component={Launch}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ format: "wide" as const }}
      />
      <Composition
        id="LaunchSquare"
        component={Launch}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{ format: "square" as const }}
      />
      <Composition
        id="LaunchVertical"
        component={Launch}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ format: "vertical" as const }}
      />
      {/* Reel 1 needs the host app on the phone; the checkout is the one drawn. */}
      <Composition
        id="ReelBugReport-checkout"
        component={WholeBugReport}
        durationInFrames={R1.duration}
        fps={REEL_FPS}
        width={REEL_W}
        height={REEL_H}
        defaultProps={{ episode: "checkout" }}
      />
      {EPISODES.map((ep) => (
        <Composition
          key={`said-${ep.id}`}
          id={`ReelSaid-${ep.id}`}
          component={SaidVsNeeded}
          durationInFrames={R2.duration}
          fps={REEL_FPS}
          width={REEL_W}
          height={REEL_H}
          defaultProps={{ episode: ep.id }}
        />
      ))}
    </>
  );
}
